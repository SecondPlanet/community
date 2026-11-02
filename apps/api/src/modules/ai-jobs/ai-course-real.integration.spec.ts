import { ConfigService } from '@nestjs/config';
import {
  AiEnqueueStatus,
  AiGenerationJob,
  AiJobStatus,
  AiJobType,
  CourseLevel,
  CourseOrigin,
  CourseStatus,
  CourseType,
  CourseVisibility,
  CostType,
  LearningProjectStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import IORedis from 'ioredis';
import { ProjectAccessPolicyService } from '../../common/project-access/project-access-policy.service';
import { AiProviderDeadlineService } from '../ai-model-gateway/ai-provider-deadline.service';
import { LearningProjectsService } from '../learning-projects/learning-projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiJobDispatcherService } from './ai-job-dispatcher.service';
import { AiJobProviderBoundaryService } from './ai-job-provider-boundary.service';
import { AiJobQueue, AiJobQueuePayload } from './ai-job-queue';
import { AiJobProcessorContext, NoopAiJobLifecycleHooks } from './ai-job-processor';
import { AiJobRunnerService } from './ai-job-runner.service';
import { RedisAiJobSemaphore } from './ai-job-semaphore';
import { BullMqAiJobQueue } from './bullmq-ai-job-queue.service';

const realDescribe = process.env.AI_REAL_INTEGRATION === '1' ? describe : describe.skip;

realDescribe('AI course real MySQL/Redis recovery evidence', () => {
  const prisma = new PrismaService();
  const prefix = `aicourse-real-${randomUUID()}`;
  const config = new ConfigService({
    AI_PERSONAL_COURSES_ENABLED: true,
    REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
    REDIS_PORT: process.env.REDIS_PORT ?? '6379',
    REDIS_DB: process.env.REDIS_DB ?? '0',
    AI_JOB_QUEUE_PREFIX: prefix,
    AI_JOB_ENQUEUE_LEASE_MS: 200,
    AI_JOB_EXECUTION_LEASE_MS: 2_000,
    AI_USER_DAILY_BYOK_TOKENS: 1_000_000,
  });
  const queues: BullMqAiJobQueue[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const queue of queues) await queue.close();
    for (const userId of userIds) {
      const projects = await prisma.learningProject.findMany({ where: { userId }, select: { courseId: true } });
      await prisma.learningProject.deleteMany({ where: { userId } });
      await prisma.course.deleteMany({ where: { id: { in: projects.map((item) => item.courseId) } } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    const redis = new IORedis({
      host: config.get<string>('REDIS_HOST'),
      port: Number(config.get<string>('REDIS_PORT')),
      db: Number(config.get<string>('REDIS_DB')),
      maxRetriesPerRequest: 1,
    });
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
    await redis.quit();
    await prisma.$disconnect();
  });

  function queue() {
    const instance = new BullMqAiJobQueue(config);
    queues.push(instance);
    return instance;
  }

  async function fixture(status: AiJobStatus = AiJobStatus.queued) {
    const id = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `ai-real-${id}@invalid.example`,
        passwordHash: 'not-a-login-secret',
        name: 'AI real dependency fixture',
        role: UserRole.student,
      },
    });
    userIds.push(user.id);
    await prisma.userAiProviderConfig.create({
      data: {
        userId: user.id,
        provider: `fixture-${id}`,
        apiKeyEnc: 'fixture-only',
        model: 'deterministic',
        verifiedAt: new Date(),
      },
    });
    const course = await prisma.course.create({
      data: {
        title: 'AI real dependency fixture',
        description: 'isolated fixture',
        learningPoints: 'isolated fixture',
        instructor: 'fixture',
        level: CourseLevel.Beginner,
        duration: '10 minutes',
        thumbnail: '',
        tags: 'fixture',
        costType: CostType.free,
        status: CourseStatus.draft,
        courseType: CourseType.own,
        origin: CourseOrigin.ai_personal,
        visibility: CourseVisibility.private,
        ownerUserId: user.id,
      },
    });
    const project = await prisma.learningProject.create({
      data: {
        userId: user.id,
        courseId: course.id,
        createRequestKey: randomUUID(),
        seedText: 'isolated fixture',
        status: LearningProjectStatus.failed,
      },
    });
    const requestKey = `${user.id}:course_plan:${randomUUID()}`;
    const job = await prisma.aiGenerationJob.create({
      data: {
        userId: user.id,
        projectId: project.id,
        type: AiJobType.course_plan,
        status,
        enqueueStatus: status === AiJobStatus.queued ? AiEnqueueStatus.pending : AiEnqueueStatus.enqueued,
        requestKey,
        inputHash: 'fixture-hash',
        errorCode: status === AiJobStatus.failed ? 'PROVIDER_TEMPORARY' : null,
        errorMessage: status === AiJobStatus.failed ? 'retryable fixture failure' : null,
      },
    });
    return { user, project, job };
  }

  function runner(
    processor: { process: jest.Mock },
    providerBoundary: AiJobProviderBoundaryService | { run: jest.Mock } = { run: jest.fn() },
  ) {
    return new AiJobRunnerService(
      prisma,
      processor as never,
      new NoopAiJobLifecycleHooks(),
      config,
      providerBoundary as never,
    );
  }

  it('Q2 recovers when Redis add succeeds but the dispatcher observes response loss', async () => {
    const { job } = await fixture();
    const realQueue = queue();
    let loseResponse = true;
    const responseLossQueue: AiJobQueue = {
      add: async (payload: AiJobQueuePayload) => {
        await realQueue.add(payload);
        if (loseResponse) {
          loseResponse = false;
          throw new Error('injected response loss after Redis accepted add');
        }
      },
      has: (id) => realQueue.has(id),
      remove: (id) => realQueue.remove(id),
      close: () => Promise.resolve(),
    };
    const dispatcher = new AiJobDispatcherService(prisma, responseLossQueue, config);
    const now = new Date();

    await expect(dispatcher.dispatchPending(now)).resolves.toBe(0);
    await expect(realQueue.has(job.id)).resolves.toBe(true);
    await expect(dispatcher.dispatchPending(new Date(now.getTime() + 1_100))).resolves.toBe(1);
    await expect(prisma.aiGenerationJob.findUnique({ where: { id: job.id } }))
      .resolves.toMatchObject({ enqueueStatus: AiEnqueueStatus.enqueued });
    await realQueue.remove(job.id);
  });

  it('Q1 keeps the DB outbox pending while Redis is unavailable and later dispatches once', async () => {
    const { job } = await fixture();
    const realQueue = queue();
    let unavailable = true;
    const recoveringQueue: AiJobQueue = {
      add: async (payload) => {
        if (unavailable) throw new Error('injected Redis unavailable');
        await realQueue.add(payload);
      },
      has: (id) => realQueue.has(id),
      remove: (id) => realQueue.remove(id),
      close: () => Promise.resolve(),
    };
    const dispatcher = new AiJobDispatcherService(prisma, recoveringQueue, config);
    const now = new Date();
    await expect(dispatcher.dispatchPending(now)).resolves.toBe(0);
    await expect(prisma.aiGenerationJob.findUnique({ where: { id: job.id } }))
      .resolves.toMatchObject({ enqueueStatus: AiEnqueueStatus.pending });
    unavailable = false;
    await expect(dispatcher.dispatchPending(new Date(now.getTime() + 1_100))).resolves.toBe(1);
    await expect(realQueue.has(job.id)).resolves.toBe(true);
    await realQueue.remove(job.id);
  });

  it('Q3 restores an enqueued DB job deleted from Redis with the same job id', async () => {
    const { job } = await fixture();
    const realQueue = queue();
    const dispatcher = new AiJobDispatcherService(prisma, realQueue, config);
    const now = new Date();
    await expect(dispatcher.dispatchPending(now)).resolves.toBe(1);
    await realQueue.remove(job.id);
    await expect(realQueue.has(job.id)).resolves.toBe(false);
    const restored = await dispatcher.reconcileMissing(new Date(now.getTime() + 61_000));
    expect(restored).toBeGreaterThanOrEqual(1);
    await expect(realQueue.has(job.id)).resolves.toBe(true);
    await realQueue.remove(job.id);
  });

  it('Q8 lets only one dispatcher and one worker claim the same execution', async () => {
    const { job } = await fixture();
    const firstQueue = queue();
    const secondQueue = queue();
    const dispatchers = [
      new AiJobDispatcherService(prisma, firstQueue, config),
      new AiJobDispatcherService(prisma, secondQueue, config),
    ];
    const dispatched = await Promise.all(dispatchers.map((item) => item.dispatchPending()));
    expect(dispatched.reduce((sum, count) => sum + count, 0)).toBe(1);
    await expect(firstQueue.has(job.id)).resolves.toBe(true);

    let providerCalls = 0;
    const processor = {
      process: jest.fn(async () => {
        providerCalls++;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
        return { commit: async () => null };
      }),
    };
    const outcomes = await Promise.all([
      runner(processor).run(job.id, { attemptNumber: 1, maxAttempts: 3 }),
      runner(processor).run(job.id, { attemptNumber: 1, maxAttempts: 3 }),
    ]);
    expect(outcomes.sort()).toEqual(['noop', 'succeeded']);
    expect(providerCalls).toBe(1);
    await expect(prisma.aiGenerationJob.findUnique({ where: { id: job.id } }))
      .resolves.toMatchObject({ status: AiJobStatus.succeeded });
    await firstQueue.remove(job.id);
  });

  it('Q14 concurrent manual retry converges on one execution and one response', async () => {
    const { user, project, job } = await fixture(AiJobStatus.failed);
    const service = new LearningProjectsService(
      prisma,
      new ProjectAccessPolicyService(),
      queue(),
      { assertAllowed: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const principal = { userId: user.id, role: UserRole.student };
    const results = await Promise.allSettled([
      service.retryJob(project.id, job.id, principal),
      service.retryJob(project.id, job.id, principal),
    ]);
    const retries = await prisma.aiGenerationJob.findMany({
      where: { requestKey: job.requestKey, executionNo: 2 },
    });
    expect(retries).toHaveLength(1);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    if (results[0].status === 'fulfilled' && results[1].status === 'fulfilled') {
      expect(results[0].value.id).toBe(results[1].value.id);
    }
  });

  it('Q9 enforces the per-user semaphore in real Redis and releases capacity', async () => {
    const { user } = await fixture();
    const redis = new IORedis({
      host: config.get<string>('REDIS_HOST'),
      port: Number(config.get<string>('REDIS_PORT')),
      db: Number(config.get<string>('REDIS_DB')),
      maxRetriesPerRequest: 1,
    });
    const semaphore = new RedisAiJobSemaphore({ getClient: () => redis } as never, config);
    await expect(semaphore.acquire(user.id, 'holder-1')).resolves.toBe(true);
    await expect(semaphore.acquire(user.id, 'holder-2')).resolves.toBe(true);
    await expect(semaphore.acquire(user.id, 'holder-3')).resolves.toBe(false);
    await semaphore.release(user.id, 'holder-1');
    await expect(semaphore.acquire(user.id, 'holder-3')).resolves.toBe(true);
    await redis.quit();
  });

  it('Q4 restarts an execution after a child process crashes before provider invocation', async () => {
    const { job } = await fixture();
    const child = spawnSync(
      process.execPath,
      [resolve(process.cwd(), '../../scripts/ai-course/fixtures/crash-worker.mjs'), job.id, 'before-provider'],
      { env: process.env, stdio: 'pipe' },
    );
    expect(child.status).toBe(86);
    const dispatcher = new AiJobDispatcherService(prisma, queue(), config);
    await expect(dispatcher.reconcileExpiredExecutions()).resolves.toBe(1);
    const processor = { process: jest.fn(async () => ({ commit: async () => null })) };
    await expect(runner(processor).run(job.id, { attemptNumber: 2, maxAttempts: 3 }))
      .resolves.toBe('succeeded');
    expect(processor.process).toHaveBeenCalledTimes(1);
  });

  it('Q5 does not invoke the provider twice after a child crashes after provider success', async () => {
    const { user, project, job } = await fixture();
    const child = spawnSync(
      process.execPath,
      [resolve(process.cwd(), '../../scripts/ai-course/fixtures/crash-worker.mjs'), job.id, 'after-provider'],
      { env: process.env, stdio: 'pipe' },
    );
    expect(child.status).toBe(86);
    let providerCalls = 0;
    const processor = {
      process: jest.fn(async (_job: AiGenerationJob, context: AiJobProcessorContext) => {
        const recovered = await context.runProviderRequest(async () => {
          providerCalls++;
          return { value: { recovered: false }, actualTokens: 42, actualCost: 0 };
        });
        expect(recovered).toEqual({ recovered: true });
        return { commit: async () => ({ recovered }) };
      }),
    };
    const boundary = new AiJobProviderBoundaryService(new AiProviderDeadlineService(prisma, config), prisma);
    await expect(runner(processor, boundary).run(job.id, { attemptNumber: 2, maxAttempts: 3 }))
      .resolves.toBe('succeeded');
    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(providerCalls).toBe(0);
  });
});
