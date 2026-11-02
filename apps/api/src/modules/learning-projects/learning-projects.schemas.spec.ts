import { EditableCoursePlanSchema as SharedEditableCoursePlanSchema } from '@secondplanet/shared-types';
import { EditableCoursePlanSchema } from './learning-projects.schemas';

describe('learning-projects shared runtime contract', () => {
  it('uses the exact shared EditableCoursePlan schema', () => {
    expect(EditableCoursePlanSchema).toBe(SharedEditableCoursePlanSchema);
  });
});
