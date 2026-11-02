import { AiJobQueue, AiJobQueuePayload } from './ai-job-queue';

export class InMemoryAiJobQueue extends AiJobQueue {
  readonly jobs = new Map<string, AiJobQueuePayload>();
  readonly addCalls: AiJobQueuePayload[] = [];

  async add(payload: AiJobQueuePayload): Promise<void> {
    this.addCalls.push(payload);
    if (!this.jobs.has(payload.id)) this.jobs.set(payload.id, payload);
  }

  async has(jobId: string): Promise<boolean> {
    return this.jobs.has(jobId);
  }

  async remove(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }

  async close(): Promise<void> {}
}
