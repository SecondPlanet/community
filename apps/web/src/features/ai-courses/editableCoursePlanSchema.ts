export { EditableCoursePlanSchema, LearningPreferencesSchema } from '@secondplanet/shared-types';

export function issueTargetId(path: PropertyKey[]) {
  if (path[0] === 'title') return 'plan-title';
  if (path[0] === 'learningOutcome') return 'plan-learning-outcome';
  if (path[0] === 'chapters' && typeof path[1] === 'number') {
    if (path[2] === 'title') return `plan-chapter-${path[1]}-title`;
    if (path[2] === 'lessons' && typeof path[3] === 'number' && path[4] === 'title') return `plan-chapter-${path[1]}-lesson-${path[3]}-title`;
  }
  return null;
}
