import { describe, expect, it } from 'vitest';
import { canonicalLearningHref } from './LegacyLearningRedirect';

describe('canonicalLearningHref', () => {
  it('preserves query and hash while migrating legacy lesson URLs', () => {
    expect(canonicalLearningHref('/dashboard/learning/course-1/lesson-2?tab=notes#mark')).toBe('/dashboard/learning/course-1/lessons/lesson-2?tab=notes#mark');
  });
  it('does not rewrite canonical or unrelated URLs', () => {
    expect(canonicalLearningHref('/dashboard/learning/course-1/lessons/lesson-2')).toBe('/dashboard/learning/course-1/lessons/lesson-2');
  });
});
