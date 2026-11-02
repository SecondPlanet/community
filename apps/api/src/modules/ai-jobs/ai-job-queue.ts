import { AiJobType } from '@prisma/client';

export const AI_JOB_QUEUE_NAME = 'ai-course-generation';

export interface AiJobQueuePayload {
  id: string;
  type: AiJobType;
}
export abstract class AiJobQueue {
  abstract add(payload: AiJobQueuePayload): Promise<void>;
  abstract has(jobId: string): Promise<boolean>;
  abstract remove(jobId: string): Promise<void>;
  abstract close(): Promise<void>;
}
