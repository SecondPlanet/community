import { z } from 'zod';

export const TutorAnswerSchema = z.object({
  answer: z.string().min(1).max(6000),
});

export const PERSONAL_COURSE_TUTOR_SCOPE = 'personal_course_tutor' as const;

export const TUTOR_HISTORY_MESSAGE_LIMIT = 12;
export const TUTOR_HISTORY_CONTENT_LIMIT = 1500;
export const TUTOR_PLAN_CONTEXT_LIMIT = 8000;
export const TUTOR_LESSON_CONTEXT_LIMIT = 10000;
