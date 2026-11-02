import { PrismaClient } from '@prisma/client';

const [jobId, crashPoint] = process.argv.slice(2);
if (!jobId || !['before-provider', 'after-provider'].includes(crashPoint)) {
  process.exit(2);
}

const prisma = new PrismaClient({ log: [] });
try {
  const now = new Date();
  const updated = await prisma.aiGenerationJob.updateMany({
    where: { id: jobId, status: 'queued' },
    data: {
      status: 'running',
      enqueueStatus: 'enqueued',
      executionLeaseOwner: `crashed-child:${process.pid}`,
      executionLeaseExpiresAt: new Date(now.getTime() - 1_000),
      heartbeatAt: new Date(now.getTime() - 2_000),
      startedAt: now,
      ...(crashPoint === 'after-provider'
        ? {
            providerRequestStartedAt: now,
            providerRequestDeadlineAt: new Date(now.getTime() + 60_000),
            providerRequestFinishedAt: now,
            resultRef: {
              checkpointVersion: 1,
              kind: 'course_plan',
              payload: { recovered: true },
              usage: { actualTokens: 42, actualCost: '0' },
            },
          }
        : {}),
    },
  });
  if (updated.count !== 1) process.exit(3);
} finally {
  await prisma.$disconnect();
}

// A non-zero exit is intentional evidence that the process did not perform a
// graceful worker shutdown after persisting its execution state.
process.exit(86);
