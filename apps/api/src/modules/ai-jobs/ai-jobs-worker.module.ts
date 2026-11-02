import { Module } from '@nestjs/common';
import { AiJobProcessor, AiJobLifecycleHooks } from './ai-job-processor';
import { AiCourseGenerationProcessor } from '../ai-course-generation/ai-course-generation.processor';
import { AiJobRunnerService } from './ai-job-runner.service';
import { AiJobWorkerRuntimeService } from './ai-job-worker-runtime.service';
import { AiWorkerHeartbeatService } from './ai-worker-heartbeat.service';
import { AiJobLifecycleService } from './ai-job-lifecycle.service';
import { AiJobProviderBoundaryService } from './ai-job-provider-boundary.service';
import { AiJobSemaphore, RedisAiJobSemaphore } from './ai-job-semaphore';

@Module({
  providers: [
    AiCourseGenerationProcessor,
    { provide: AiJobProcessor, useExisting: AiCourseGenerationProcessor },
    RedisAiJobSemaphore,
    { provide: AiJobSemaphore, useExisting: RedisAiJobSemaphore },
    AiJobLifecycleService,
    { provide: AiJobLifecycleHooks, useExisting: AiJobLifecycleService },
    AiJobProviderBoundaryService,
    AiJobRunnerService,
    AiWorkerHeartbeatService,
    AiJobWorkerRuntimeService,
  ],
})
export class AiJobsWorkerModule {}
