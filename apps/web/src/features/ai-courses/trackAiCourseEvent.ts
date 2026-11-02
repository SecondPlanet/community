import { learningEventsApi, type CreateLearningEventInput } from '../../lib/learningEventsApi';

/** Analytics is deliberately best effort and must never interrupt learning. */
export function trackAiCourseEvent(input: CreateLearningEventInput) {
  try {
    void Promise.resolve(learningEventsApi.createOne(input)).catch(() => undefined);
  } catch {
    // Test doubles, blocked storage/network and client shutdown are all non-fatal.
  }
}
