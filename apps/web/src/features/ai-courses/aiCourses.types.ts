import type {
  AiGenerationJobView as SharedAiGenerationJobView,
  Chapter,
  Course,
  CourseLevel,
  CreateLearningProjectAccepted,
  CreateLearningProjectRequest,
  EditableCoursePlanContract,
  LearningProjectStatus,
  Lesson,
  LessonContentBlock,
  NormalizedLearningPreferences,
} from '@secondplanet/shared-types';

// Shared API contracts are re-exported through this feature boundary. Types
// below this block are Web-only response composition/view models.
export type CreateLearningProjectInput = CreateLearningProjectRequest;
export type CreateLearningProjectResponse = CreateLearningProjectAccepted;
export type EditableCoursePlan = EditableCoursePlanContract;
export type LearningPreferences = NormalizedLearningPreferences;
export type AiGenerationJobView = SharedAiGenerationJobView;
export type LessonBlock = LessonContentBlock;

export type LearningProjectErrorStage = 'plan' | 'first_lesson' | null;

export interface LearningProjectListItem {
  id: string;
  course: Pick<Course, 'id' | 'title' | 'description' | 'level'>;
  seedText: string;
  status: LearningProjectStatus;
  errorStage: LearningProjectErrorStage;
  activeLesson: Pick<Lesson, 'id' | 'title'> | null;
  completedLessons: number;
  totalLessons: number;
  masteryLabel: string | null;
  continueHref: string;
  lastAccessedAt: string | null;
  updatedAt: string;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface LearningProjectDetail extends LearningProjectListItem {
  courseId: string;
  learningGoal: string | null;
  targetLevel: CourseLevel | null;
  availableMinutes: number | null;
  preferences: NormalizedLearningPreferences;
  plan: EditableCoursePlanContract | null;
  chapters: Array<Chapter & { lessons: Lesson[] }>;
  activeBlockId: string | null;
  activeBlockOffset: number | null;
  currentJobId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface ApproveCoursePlanResponse {
  projectId: string;
  courseId: string;
  firstLessonId: string;
  jobId: string;
  status: 'generating_first_lesson';
  continueHref: string;
}

export type LessonContentStatus = 'empty' | 'queued' | 'generating' | 'ready' | 'failed';

export interface LessonContentView {
  lessonId: string;
  status: LessonContentStatus;
  schemaVersion: number;
  version: number;
  blocks: LessonContentBlock[] | null;
  summary: string | null;
  glossary: Array<{ term: string; definition: string }> | null;
  generatedAt: string | null;
  generation: {
    jobId: string;
    status: 'queued' | 'running';
    targetVersion: number | null;
    regenerating: boolean;
  } | null;
}

export interface LessonActivityInput {
  lessonId: string;
  blockId: string | null;
  blockOffset: number | null;
  occurredAt: string;
}

export type LessonVariantAction = 'simplify' | 'deepen' | 'new_example';
export interface LessonVariantCreationResponse {
  variantId: string;
  jobId: string;
  status: 'queued' | 'running';
  contentVersion: number;
}
export type AssessmentQuestionType = 'single_choice' | 'short_answer' | 'teach_back';

export interface AssessmentQuestionView {
  id: string;
  type: AssessmentQuestionType;
  prompt: string;
  options?: Array<string | { id?: string; value?: string; label?: string; text?: string }>;
}

export interface AssessmentView {
  id: string;
  lessonId: string;
  kind?: 'diagnostic' | 'lesson_check' | 'remediation';
  status: 'generating' | 'ready' | 'failed';
  lessonContentVersion: number;
  schemaVersion: number;
  questions?: AssessmentQuestionView[];
  errorCode?: string;
}

export interface AssessmentCreationResponse {
  assessmentId: string;
  status: 'generating' | 'ready' | 'failed';
  jobId: string | null;
}

export interface AssessmentAnswerInput {
  questionId: string;
  answer: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SubmitAssessmentAttemptInput {
  answers: AssessmentAnswerInput[];
  clientSubmissionKey: string;
}

export interface AssessmentAttemptPending {
  attemptId: string;
  status: 'pending' | 'grading';
  jobId: string | null;
}

export interface AssessmentAttemptCompleted {
  attemptId: string;
  status: 'completed';
  score: number | null;
  grading: {
    feedback?: Array<{
      questionId: string;
      verdict: 'correct' | 'partial' | 'incorrect';
      explanation: string;
    }>;
    items?: Array<{
      questionId: string;
      verdict: 'correct' | 'incorrect';
      explanation: string | null;
    }>;
    misconceptions?: string[];
    mastery?: Array<{ conceptKey: string; score: number; evidence: string }>;
    masteryUpdates?: unknown[];
  } | null;
  recommendation: {
    nextStep: 'review' | 'reinforce' | 'continue';
    message?: string;
    continueHref?: string;
  } | null;
}

export interface AssessmentAttemptFailed {
  attemptId: string;
  status: 'failed';
  errorCode: string;
  retryable: boolean;
}

export type AssessmentAttemptView =
  | AssessmentAttemptPending
  | AssessmentAttemptCompleted
  | AssessmentAttemptFailed;

export type SubmitAssessmentAttemptResponse = AssessmentAttemptView;

export interface LearningHomeItem {
  id: string;
  kind: 'platform' | 'ai_personal';
  title: string;
  progress: number;
  lastAccessedAt: string | null;
  continueHref: string;
}

export type LearningHomeResponse = CursorPage<LearningHomeItem>;

export interface TutorMessageView {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface TutorSessionView {
  id: string;
  projectId: string;
  courseId: string;
  lessonId: string | null;
  title: string | null;
  scope: 'personal_course_tutor';
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  messages?: TutorMessageView[];
}

export interface TutorTurnResponse {
  sessionId: string;
  projectId: string;
  lessonId: string | null;
  scope: 'personal_course_tutor';
  userMessage: TutorMessageView;
  assistantMessage: TutorMessageView;
}
