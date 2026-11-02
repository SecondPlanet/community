import { describe, expect, it } from 'vitest';
import { EditableCoursePlanSchema } from './editableCoursePlanSchema';
import { EditableCoursePlanSchema as SharedEditableCoursePlanSchema } from '@secondplanet/shared-types';

function validPlan() {
  const concepts = ['concept-a', 'concept-b', 'concept-c'].map((key) => ({ key, title: key, description: '一个可用于课程的核心概念' }));
  return {
    title: '一门完整测试课程', description: '这是一段满足服务端长度约束的课程描述，用于客户端契约往返测试。', learningOutcome: '完成后能够解释并应用三个核心概念。',
    level: 'Beginner' as const, estimatedMinutes: 90, prerequisites: [], concepts,
    chapters: [0, 1, 2].map((index) => ({ tempKey: `chapter-${index}`, title: `章节 ${index + 1}`, objective: '建立并应用本章的核心知识', lessons: [{ tempKey: `lesson-${index}`, title: `课时 ${index + 1}`, objective: '理解并能够说明本课核心概念', conceptKeys: [concepts[index].key], estimatedMinutes: 30, isHidden: false }] })),
    planVersion: 1,
    preferences: { explanationStyle: 'balanced' as const, depth: 'standard' as const, goalType: 'systematic' as const, language: 'zh-CN' as const, includeMath: true, includeCode: true },
  };
}

describe('EditableCoursePlanSchema API contract', () => {
  it('uses the shared runtime schema rather than a Web mirror', () => {
    expect(EditableCoursePlanSchema).toBe(SharedEditableCoursePlanSchema);
  });
  it('round-trips a complete editable plan without dropping preferences', () => {
    const input = validPlan();
    const parsed = EditableCoursePlanSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(parsed).toEqual(input);
    expect(parsed.preferences.depth).toBe('standard');
  });

  it('rejects duplicate temp keys and unknown concept references', () => {
    const input = validPlan();
    input.chapters[1].tempKey = input.chapters[0].tempKey;
    input.chapters[0].lessons[0].conceptKeys = ['missing'];
    const result = EditableCoursePlanSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([expect.stringContaining('重复'), expect.stringContaining('未知概念')]));
  });
});
