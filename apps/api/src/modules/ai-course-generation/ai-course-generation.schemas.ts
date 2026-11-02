import { z } from 'zod';

const conceptKey = z.string().regex(/^[a-z0-9-]{2,50}$/);

export const CoursePlanSchema = z.object({
  title: z.string().min(4).max(80),
  description: z.string().min(20).max(500),
  learningOutcome: z.string().min(10).max(500),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  estimatedMinutes: z.number().int().min(20).max(2400),
  prerequisites: z.array(z.string().max(100)).max(8),
  concepts: z.array(z.object({
    key: conceptKey,
    title: z.string().min(1).max(80),
    description: z.string().max(300),
  })).min(3).max(40),
  chapters: z.array(z.object({
    tempKey: z.string().min(1).max(64),
    title: z.string().min(2).max(100),
    objective: z.string().min(5).max(300),
    lessons: z.array(z.object({
      tempKey: z.string().min(1).max(64),
      title: z.string().min(2).max(100),
      objective: z.string().min(5).max(300),
      conceptKeys: z.array(conceptKey).min(1).max(8),
      estimatedMinutes: z.number().int().min(3).max(120),
    })).min(1).max(6),
  })).min(3).max(6),
}).superRefine((plan, ctx) => {
  const knownConcepts = new Set<string>();
  plan.concepts.forEach((concept, index) => {
    if (knownConcepts.has(concept.key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['concepts', index, 'key'], message: 'Concept keys must be unique' });
    }
    knownConcepts.add(concept.key);
  });
  const tempKeys = new Set<string>();
  let lessonCount = 0;
  for (const [chapterIndex, chapter] of plan.chapters.entries()) {
    if (tempKeys.has(chapter.tempKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterIndex, 'tempKey'], message: 'tempKey must be unique' });
    }
    tempKeys.add(chapter.tempKey);
    lessonCount += chapter.lessons.length;
    for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
      if (tempKeys.has(lesson.tempKey)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterIndex, 'lessons', lessonIndex, 'tempKey'], message: 'tempKey must be unique' });
      }
      tempKeys.add(lesson.tempKey);
      const lessonConcepts = new Set<string>();
      for (const key of lesson.conceptKeys) {
        if (lessonConcepts.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterIndex, 'lessons', lessonIndex, 'conceptKeys'], message: 'Lesson concept keys must be unique' });
        }
        lessonConcepts.add(key);
        if (!knownConcepts.has(key)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterIndex, 'lessons', lessonIndex, 'conceptKeys'], message: `Unknown concept key: ${key}` });
        }
      }
    }
  }
  if (lessonCount > 24) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters'], message: 'A course may contain at most 24 lessons' });
});

const blockId = z.string().regex(/^[a-z0-9-]{2,80}$/);
const blockConcepts = z.array(conceptKey).max(8);
export const LessonContentSchema = z.object({
  blocks: z.array(z.discriminatedUnion('type', [
    z.object({ id: blockId, type: z.literal('objective'), items: z.array(z.string().min(2).max(180)).min(1).max(8) }),
    z.object({ id: blockId, type: z.literal('paragraph'), title: z.string().max(100).optional(), markdown: z.string().min(20).max(8000), conceptKeys: blockConcepts }),
    z.object({ id: blockId, type: z.literal('callout'), tone: z.enum(['intuition', 'important', 'warning']), title: z.string().min(2).max(100), markdown: z.string().min(10).max(3000) }),
    z.object({ id: blockId, type: z.literal('example'), title: z.string().min(2).max(100), scenario: z.string().min(10).max(1000), walkthrough: z.array(z.string().min(2).max(1000)).min(2).max(10), conceptKeys: blockConcepts }),
    z.object({ id: blockId, type: z.literal('steps'), title: z.string().min(2).max(100), items: z.array(z.object({ title: z.string().min(1).max(100), markdown: z.string().min(5).max(2000) })).min(2).max(10) }),
    z.object({ id: blockId, type: z.literal('misconception'), claim: z.string().min(5).max(500), correction: z.string().min(5).max(1000), conceptKeys: blockConcepts }),
    z.object({ id: blockId, type: z.literal('reflection'), prompt: z.string().min(5).max(500), conceptKeys: blockConcepts }),
    z.object({ id: blockId, type: z.literal('summary'), items: z.array(z.string().min(2).max(300)).min(2).max(10) }),
  ])).min(5).max(30),
  summary: z.string().min(20).max(1000),
  glossary: z.array(z.object({ term: z.string().min(1).max(80), definition: z.string().min(3).max(400) })).max(30),
  generationNote: z.string().max(500).optional(),
}).superRefine((content, ctx) => {
  const ids = new Set<string>();
  for (const [index, block] of content.blocks.entries()) {
    if (ids.has(block.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index, 'id'], message: 'Block id must be unique' });
    ids.add(block.id);
  }
  if (content.blocks[0]?.type !== 'objective') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', 0], message: 'First block must state objectives' });
  if (content.blocks.at(-1)?.type !== 'summary') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks'], message: 'Last block must be a summary' });
  const visibleText = [
    ...content.blocks.flatMap((block) => {
      switch (block.type) {
        case 'objective': return block.items;
        case 'paragraph': return [block.title ?? '', block.markdown];
        case 'callout': return [block.title, block.markdown];
        case 'example': return [block.title, block.scenario, ...block.walkthrough];
        case 'steps': return [block.title, ...block.items.flatMap((item) => [item.title, item.markdown])];
        case 'misconception': return [block.claim, block.correction];
        case 'reflection': return [block.prompt];
        case 'summary': return block.items;
      }
    }),
    content.summary,
    ...content.glossary.flatMap((entry) => [entry.term, entry.definition]),
  ].join('').replace(/\s/g, '');
  const visibleCharacters = Array.from(visibleText).length;
  if (visibleCharacters < 800 || visibleCharacters > 2500) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['blocks'],
      message: `Lesson visible text must contain 800-2500 characters (received ${visibleCharacters})`,
    });
  }
});

export type CoursePlan = z.infer<typeof CoursePlanSchema>;
export type GeneratedLessonContent = z.infer<typeof LessonContentSchema>;

const assessmentQuestion = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,80}$/),
  type: z.enum(['single_choice', 'short_answer', 'teach_back']),
  prompt: z.string().min(5).max(1000),
  options: z.array(z.object({
    id: z.string().min(1).max(20),
    text: z.string().min(1).max(500),
  })).min(2).max(6).optional(),
  correctAnswer: z.string().min(1).max(1000).optional(),
  rubric: z.array(z.string().min(2).max(500)).min(1).max(6).optional(),
  explanation: z.string().min(5).max(1500),
  conceptKeys: z.array(conceptKey).min(1).max(6),
}).superRefine((question, ctx) => {
  if (question.type === 'single_choice' && (!question.options || !question.correctAnswer)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choice questions require options and a correct answer' });
  }
  if (question.type === 'single_choice' && question.options && question.correctAnswer &&
    !question.options.some((option) => option.id === question.correctAnswer)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['correctAnswer'], message: 'correctAnswer must match an option id' });
  }
  if (question.options && new Set(question.options.map((option) => option.id)).size !== question.options.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Option ids must be unique' });
  }
  if (new Set(question.conceptKeys).size !== question.conceptKeys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conceptKeys'], message: 'Question concept keys must be unique' });
  }
  if (question.type !== 'single_choice' && !question.rubric) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Open questions require a rubric' });
  }
});

export const GeneratedAssessmentSchema = z.object({
  questions: z.array(assessmentQuestion).length(3),
}).superRefine((assessment, ctx) => {
  const ids = new Set<string>();
  for (const [index, question] of assessment.questions.entries()) {
    if (ids.has(question.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions', index, 'id'], message: 'Question id must be unique' });
    ids.add(question.id);
  }
  if (!assessment.questions.some((question) => question.type !== 'single_choice')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['questions'], message: 'Include at least one open question' });
  }
});

export const AssessmentGradingSchema = z.object({
  score: z.number().int().min(0).max(100),
  feedback: z.array(z.object({
    questionId: z.string().min(1).max(100),
    verdict: z.enum(['correct', 'partial', 'incorrect']),
    explanation: z.string().min(3).max(1500),
  })).min(1).max(100),
  misconceptions: z.array(z.string().min(2).max(500)).max(12),
  mastery: z.array(z.object({
    conceptKey,
    score: z.number().int().min(0).max(100),
    evidence: z.string().min(2).max(500),
  })).min(1).max(20),
  recommendation: z.object({
    nextStep: z.enum(['review', 'reinforce', 'continue']),
    message: z.string().min(3).max(500),
  }),
}).superRefine((grading, ctx) => {
  const feedbackIds = new Set<string>();
  grading.feedback.forEach((item, index) => {
    if (feedbackIds.has(item.questionId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['feedback', index, 'questionId'], message: 'Feedback question ids must be unique' });
    }
    feedbackIds.add(item.questionId);
  });
  const conceptKeys = new Set<string>();
  grading.mastery.forEach((item, index) => {
    if (conceptKeys.has(item.conceptKey)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mastery', index, 'conceptKey'], message: 'Mastery concept keys must be unique' });
    }
    conceptKeys.add(item.conceptKey);
  });
});

export const LessonVariantSchema = z.object({
  title: z.string().min(2).max(100),
  markdown: z.string().min(20).max(8000),
  keyTakeaway: z.string().min(5).max(500),
});

export type GeneratedAssessment = z.infer<typeof GeneratedAssessmentSchema>;
export type AssessmentGrading = z.infer<typeof AssessmentGradingSchema>;
export type GeneratedLessonVariant = z.infer<typeof LessonVariantSchema>;
