import { AssessmentGradingSchema, CoursePlanSchema, GeneratedAssessmentSchema, LessonContentSchema } from './ai-course-generation.schemas';

describe('AI course generation schemas', () => {
  const concept = { key: 'core-idea', title: '核心概念', description: '用于测试的核心概念' };
  const chapter = (key: string) => ({
    tempKey: `chapter-${key}`,
    title: `章节 ${key}`,
    objective: '理解并能够应用这一组核心知识',
    lessons: [{
      tempKey: `lesson-${key}`,
      title: `课程 ${key}`,
      objective: '掌握本节知识并完成实际应用',
      conceptKeys: ['core-idea'],
      estimatedMinutes: 20,
    }],
  });

  it('accepts a bounded course plan with resolvable concepts', () => {
    expect(CoursePlanSchema.safeParse({
      title: '从问题到完整课程',
      description: '一套用于验证课程蓝图结构和学习路径约束的完整课程。',
      learningOutcome: '能够解释核心概念并在真实场景中独立运用。',
      level: 'Beginner',
      estimatedMinutes: 90,
      prerequisites: [],
      concepts: [concept, { ...concept, key: 'practice', title: '实践' }, { ...concept, key: 'review', title: '复习' }],
      chapters: [chapter('one'), chapter('two'), chapter('three')],
    }).success).toBe(true);
  });

  it('rejects duplicate temp keys and unknown concepts', () => {
    const duplicate = chapter('same');
    duplicate.lessons[0].tempKey = duplicate.tempKey;
    duplicate.lessons[0].conceptKeys = ['missing'];
    const result = CoursePlanSchema.safeParse({
      title: '从问题到完整课程',
      description: '一套用于验证课程蓝图结构和学习路径约束的完整课程。',
      learningOutcome: '能够解释核心概念并在真实场景中独立运用。',
      level: 'Beginner',
      estimatedMinutes: 90,
      prerequisites: [],
      concepts: [concept, { ...concept, key: 'practice' }, { ...concept, key: 'review' }],
      chapters: [duplicate, chapter('two'), chapter('three')],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['tempKey must be unique', 'Unknown concept key: missing']),
    );
  });

  it('requires objective first, summary last, and unique block ids', () => {
    const block = { id: 'same-block', type: 'paragraph' as const, markdown: '足够长的正文内容，用来满足结构化教材段落的最小长度。', conceptKeys: [] };
    const result = LessonContentSchema.safeParse({
      blocks: [
        block,
        block,
        { id: 'example', type: 'example', title: '例子', scenario: '这是一个足够完整的真实应用场景。', walkthrough: ['第一步', '第二步'], conceptKeys: [] },
        { id: 'reflection', type: 'reflection', prompt: '你会如何把它应用到自己的问题中？', conceptKeys: [] },
        { id: 'not-last', type: 'paragraph', markdown: '结尾仍然不是总结，因此应该被结构校验拒绝。', conceptKeys: [] },
      ],
      summary: '这是一段足够长的课程摘要，用来验证教材结构校验规则。',
      glossary: [],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['Block id must be unique', 'First block must state objectives', 'Last block must be a summary']),
    );
  });

  it('requires 800-2500 learner-visible characters in a generated lesson', () => {
    const lesson = (characters: number) => ({
      blocks: [
        { id: 'objectives', type: 'objective' as const, items: ['理解核心概念'] },
        { id: 'body', type: 'paragraph' as const, markdown: '知'.repeat(characters), conceptKeys: [] },
        { id: 'example', type: 'example' as const, title: '例子', scenario: '这是一个完整的应用场景', walkthrough: ['观察现象', '分析原因'], conceptKeys: [] },
        { id: 'reflection', type: 'reflection' as const, prompt: '请解释你将如何应用这个概念', conceptKeys: [] },
        { id: 'summary', type: 'summary' as const, items: ['回顾核心概念', '继续主动练习'] },
      ],
      summary: '这是一段完整的课程摘要，用于帮助学习者回顾本节的主要知识和应用方法。',
      glossary: [],
    });
    expect(LessonContentSchema.safeParse(lesson(850)).success).toBe(true);
    expect(LessonContentSchema.safeParse(lesson(100)).success).toBe(false);
    expect(LessonContentSchema.safeParse(lesson(2600)).success).toBe(false);
  });

  it('rejects answer keys that do not reference a choice option', () => {
    const choice = (id: string) => ({
      id, type: 'single_choice', prompt: '请选择正确的核心概念说明',
      options: [{ id: 'a', text: '选项 A' }, { id: 'b', text: '选项 B' }],
      correctAnswer: id === 'q1' ? 'missing' : 'a', explanation: '这是答案的详细解释', conceptKeys: ['core-idea'],
    });
    const result = GeneratedAssessmentSchema.safeParse({ questions: [
      choice('q1'), choice('q2'),
      { id: 'q4', type: 'short_answer', prompt: '请解释这个核心概念的作用', rubric: ['说明核心机制'], explanation: '这是参考解释', conceptKeys: ['core-idea'] },
    ] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain('correctAnswer must match an option id');
  });

  it('accepts exactly three assessment questions and rejects any other count', () => {
    const open = (id: string) => ({
      id, type: 'short_answer' as const, prompt: '请解释这个核心概念的实际作用',
      rubric: ['说明核心机制'], explanation: '这是参考解释', conceptKeys: ['core-idea'],
    });
    const three = [open('q1'), open('q2'), open('q3')];
    expect(GeneratedAssessmentSchema.safeParse({ questions: three }).success).toBe(true);
    expect(GeneratedAssessmentSchema.safeParse({ questions: [...three, open('q4')] }).success).toBe(false);
  });

  it('rejects duplicate grading evidence that could increment mastery twice', () => {
    const result = AssessmentGradingSchema.safeParse({
      score: 80,
      feedback: [
        { questionId: 'q1', verdict: 'correct', explanation: '回答正确' },
        { questionId: 'q1', verdict: 'partial', explanation: '重复反馈' },
      ],
      misconceptions: [],
      mastery: [
        { conceptKey: 'core-idea', score: 80, evidence: '证据一' },
        { conceptKey: 'core-idea', score: 90, evidence: '证据二' },
      ],
      recommendation: { nextStep: 'continue', message: '继续学习' },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'Feedback question ids must be unique', 'Mastery concept keys must be unique',
    ]));
  });
});
