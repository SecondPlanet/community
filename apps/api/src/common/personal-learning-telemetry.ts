import { LearningEventType, Prisma } from '@prisma/client';

type LearningEventWriter = {
  learningEvent?: {
    create(args: Prisma.LearningEventCreateArgs): Promise<unknown>;
  };
};

/**
 * Writes server-authoritative funnel events. Metadata is intentionally an
 * allowlisted set of opaque identifiers/versions; prompts, answers and lesson
 * content must never be passed here.
 */
export function recordPersonalLearningEvent(
  client: LearningEventWriter,
  input: {
    userId: string;
    eventType: Extract<LearningEventType, `personal_${string}`>;
    lessonId?: string;
    projectId: string;
    jobId?: string;
    planVersion?: number;
    contentVersion?: number;
    attemptId?: string;
  },
) {
  const { userId, eventType, lessonId, ...metadata } = input;
  // Some isolated unit-test transaction fakes intentionally expose only the
  // model under test. Real Prisma clients always expose learningEvent.
  if (!client.learningEvent) return Promise.resolve(undefined);
  return client.learningEvent.create({
    data: {
      userId,
      eventType,
      lessonId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}
