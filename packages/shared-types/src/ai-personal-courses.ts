export type AiPersonalCourseLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type LearningGoalType = 'quick_understanding' | 'systematic' | 'project' | 'exam';
export type ExplanationStyle = 'balanced' | 'simple' | 'technical' | 'practical';
export type LearningDepth = 'introductory' | 'standard' | 'deep';
export type LearningProjectStatus =
  | 'planning'
  | 'plan_ready'
  | 'generating_first_lesson'
  | 'ready'
  | 'learning'
  | 'completed'
  | 'failed'
  | 'archived';
export type AiGenerationJobType =
  | 'course_plan'
  | 'lesson_content'
  | 'lesson_variant'
  | 'assessment_generate'
  | 'assessment_grade';
export type AiGenerationJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface LearningPreferences {
  explanationStyle?: ExplanationStyle;
  depth?: LearningDepth;
  goalType?: LearningGoalType;
  language?: 'zh-CN' | 'en';
  includeMath?: boolean;
  includeCode?: boolean;
}

export interface NormalizedLearningPreferences {
  explanationStyle: ExplanationStyle;
  depth: LearningDepth;
  goalType: LearningGoalType;
  language: 'zh-CN' | 'en';
  includeMath: boolean;
  includeCode: boolean;
}

export interface CreateLearningProjectRequest {
  question: string;
  goalType?: LearningGoalType;
  targetLevel?: AiPersonalCourseLevel;
  availableMinutes?: number;
  preferences?: LearningPreferences;
}

export interface CreateLearningProjectAccepted {
  projectId: string;
  courseId: string;
  jobId: string;
  status: 'planning';
}

export interface CoursePlanConcept {
  key: string;
  title: string;
  description: string;
}

export interface CoursePlanLesson {
  tempKey: string;
  title: string;
  objective: string;
  conceptKeys: string[];
  estimatedMinutes: number;
  isHidden?: boolean;
}

export interface CoursePlanChapter {
  tempKey: string;
  title: string;
  objective: string;
  lessons: CoursePlanLesson[];
}

export interface CoursePlanContract {
  title: string;
  description: string;
  learningOutcome: string;
  level: AiPersonalCourseLevel;
  estimatedMinutes: number;
  prerequisites: string[];
  concepts: CoursePlanConcept[];
  chapters: CoursePlanChapter[];
}

export interface EditableCoursePlanContract extends CoursePlanContract {
  planVersion: number;
  preferences: NormalizedLearningPreferences;
  chapters: Array<
    Omit<CoursePlanChapter, 'lessons'> & {
      lessons: Array<CoursePlanLesson & { isHidden: boolean }>;
    }
  >;
}

export type LessonContentBlock =
  | { id: string; type: 'objective'; items: string[] }
  | { id: string; type: 'paragraph'; title?: string; markdown: string; conceptKeys: string[] }
  | {
      id: string;
      type: 'callout';
      tone: 'intuition' | 'important' | 'warning';
      title: string;
      markdown: string;
    }
  | {
      id: string;
      type: 'example';
      title: string;
      scenario: string;
      walkthrough: string[];
      conceptKeys: string[];
    }
  | { id: string; type: 'steps'; title: string; items: Array<{ title: string; markdown: string }> }
  | { id: string; type: 'misconception'; claim: string; correction: string; conceptKeys: string[] }
  | { id: string; type: 'reflection'; prompt: string; conceptKeys: string[] }
  | { id: string; type: 'summary'; items: string[] };

export interface AiJobRunningView {
  id: string;
  type: AiGenerationJobType;
  status: 'queued' | 'running';
  progress: number;
  currentStep: string | null;
  retryable: false;
  errorCode: null;
}

export interface AiJobSucceededView {
  id: string;
  type: AiGenerationJobType;
  status: 'succeeded';
  resultRef: {
    projectId: string;
    lessonId?: string;
    contentVersion?: number;
    continueHref?: string;
    variantId?: string;
    variantContent?: {
      title: string;
      markdown: string;
      keyTakeaway: string;
    };
  };
}

export interface AiJobFailedView {
  id: string;
  type: AiGenerationJobType;
  status: 'failed';
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  manualRetries: number;
}

export interface AiJobCancelledView {
  id: string;
  type: AiGenerationJobType;
  status: 'cancelled';
}

export type AiGenerationJobView =
  | AiJobRunningView
  | AiJobSucceededView
  | AiJobFailedView
  | AiJobCancelledView;
