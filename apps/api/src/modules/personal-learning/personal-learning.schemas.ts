import { Prisma } from '@prisma/client';
import { z } from 'zod';

const questionType = z.enum(['single_choice', 'short_answer', 'teach_back']);

const optionSchema = z.union([
  z.string().min(1).max(1_000),
  z.object({
    id: z.string().min(1).max(100).optional(),
    value: z.string().min(1).max(1_000).optional(),
    label: z.string().min(1).max(1_000).optional(),
    text: z.string().min(1).max(1_000).optional(),
  }).passthrough().superRefine((option, context) => {
    if (!option.id && !option.value && !option.label && !option.text) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Option text is required' });
    }
  }),
]);

export const InternalAssessmentQuestionSchema = z.object({
  id: z.string().min(1).max(100),
  type: questionType,
  prompt: z.string().min(1).max(10_000),
  options: z.array(optionSchema).min(2).max(12).optional(),
  correctAnswer: z.string().max(1_000).optional(),
  rubric: z.unknown().optional(),
  explanation: z.string().max(10_000).optional(),
  conceptKeys: z.array(z.string()).optional(),
}).superRefine((question, context) => {
  if (question.type === 'single_choice') {
    if (!question.options) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Required' });
    }
    if (question.correctAnswer === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['correctAnswer'], message: 'Required' });
    }
  }
});

export type InternalAssessmentQuestion = z.infer<typeof InternalAssessmentQuestionSchema>;

const InternalAssessmentQuestionsSchema = z
  .array(InternalAssessmentQuestionSchema)
  .min(1)
  .max(100)
  .superRefine((questions, context) => {
    const ids = new Set<string>();
    questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: 'Question ids must be unique',
        });
      }
      ids.add(question.id);
    });
  });

export function parseAssessmentQuestions(value: Prisma.JsonValue | null) {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value) &&
        Array.isArray((value as Record<string, Prisma.JsonValue>).questions)
      ? (value as Record<string, Prisma.JsonValue>).questions
      : null;
  return InternalAssessmentQuestionsSchema.safeParse(candidate);
}

export function publicQuestion(question: InternalAssessmentQuestion) {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    ...(question.options
      ? {
          options: question.options.map((option) => {
            if (typeof option === 'string') return option;
            return {
              ...(option.id !== undefined ? { id: option.id } : {}),
              ...(option.value !== undefined ? { value: option.value } : {}),
              ...(option.label !== undefined ? { label: option.label } : {}),
              ...(option.text !== undefined ? { text: option.text } : {}),
            };
          }),
        }
      : {}),
  };
}
