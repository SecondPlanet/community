import { AiJobWorkerRuntimeService } from './ai-job-worker-runtime.service';

describe('AiJobWorkerRuntimeService', () => {
  it('does not start a Redis consumer or heartbeat when the personal-course flag is disabled', async () => {
    const runner = { run: jest.fn() } as any;
    const config = {
      get: jest.fn((key: string) => key === 'AI_JOB_WORKER_ENABLED'),
    } as any;
    const heartbeat = { start: jest.fn(), stop: jest.fn() } as any;
    const service = new AiJobWorkerRuntimeService(runner, config, heartbeat);

    await service.onModuleInit();

    expect(config.get).toHaveBeenCalledWith('AI_PERSONAL_COURSES_ENABLED');
    expect(runner.run).not.toHaveBeenCalled();
    expect(heartbeat.start).not.toHaveBeenCalled();
  });
});
