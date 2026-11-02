import { z } from 'zod';

export const LearningPreferencesSchema = z.object({
  explanationStyle: z.enum(['balanced', 'simple', 'technical', 'practical']).default('balanced'),
  depth: z.enum(['introductory', 'standard', 'deep']).default('standard'),
  goalType: z.enum(['quick_understanding', 'systematic', 'project', 'exam']).default('systematic'),
  language: z.enum(['zh-CN', 'en']).default('zh-CN'),
  includeMath: z.boolean().default(true),
  includeCode: z.boolean().default(true),
});

const CoursePlanConceptSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{2,50}$/),
  title: z.string().min(1).max(80),
  description: z.string().max(300),
});

const CoursePlanLessonSchema = z.object({
  tempKey: z.string().min(1).max(100),
  title: z.string().min(2).max(100),
  objective: z.string().min(5).max(300),
  conceptKeys: z.array(z.string()).min(1).max(8),
  estimatedMinutes: z.number().int().min(3).max(120),
  isHidden: z.boolean().default(false),
});

const CoursePlanChapterSchema = z.object({
  tempKey: z.string().min(1).max(100),
  title: z.string().min(2).max(100),
  objective: z.string().min(5).max(300),
  lessons: z.array(CoursePlanLessonSchema).min(1).max(6),
});

export const EditableCoursePlanSchema = z.object({
  title: z.string().min(4).max(80),
  description: z.string().min(20).max(500),
  learningOutcome: z.string().min(10).max(500),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  estimatedMinutes: z.number().int().min(20).max(2400),
  prerequisites: z.array(z.string().max(100)).max(8),
  concepts: z.array(CoursePlanConceptSchema).min(3).max(40),
  chapters: z.array(CoursePlanChapterSchema).min(3).max(6),
  planVersion: z.number().int().min(1),
  preferences: LearningPreferencesSchema,
}).superRefine((plan, context) => {
  const conceptKeys = new Set(plan.concepts.map((concept) => concept.key));
  if (conceptKeys.size !== plan.concepts.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['concepts'], message: '概念键不能重复' });
  }
  const tempKeys = new Set<string>();
  let lessonCount = 0;
  let visibleLessonCount = 0;
  plan.chapters.forEach((chapter, chapterIndex) => {
    if (tempKeys.has(chapter.tempKey)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterIndex, 'tempKey'], message: '章节和课时标识不能重复' });
    }
    tempKeys.add(chapter.tempKey);
    chapter.lessons.forEach((lesson, lessonIndex) => {
      lessonCount += 1;
      if (!lesson.isHidden) visibleLessonCount += 1;
      if (tempKeys.has(lesson.tempKey)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterIndex, 'lessons', lessonIndex, 'tempKey'], message: '章节和课时标识不能重复' });
      }
      tempKeys.add(lesson.tempKey);
      lesson.conceptKeys.forEach((key, conceptIndex) => {
        if (!conceptKeys.has(key)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters', chapterIndex, 'lessons', lessonIndex, 'conceptKeys', conceptIndex], message: `未知概念：${key}` });
        }
      });
    });
  });
  if (lessonCount > 24) context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters'], message: '一门课程最多包含 24 个课时' });
  if (visibleLessonCount === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['chapters'], message: '请至少保留一个可见课时' });
});

export type EditableCoursePlan = z.infer<typeof EditableCoursePlanSchema>;
