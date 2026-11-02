import api from '../../lib/api';
import type {
  AiGenerationJobView,
  AssessmentCreationResponse,
  ApproveCoursePlanResponse,
  AssessmentAttemptView,
  AssessmentView,
  CreateLearningProjectInput,
  CreateLearningProjectResponse,
  CursorPage,
  EditableCoursePlan,
  LearningHomeResponse,
  LearningProjectDetail,
  LearningProjectListItem,
  LessonActivityInput,
  LessonContentView,
  LessonVariantAction,
  LessonVariantCreationResponse,
  SubmitAssessmentAttemptInput,
  SubmitAssessmentAttemptResponse,
  TutorSessionView,
  TutorTurnResponse,
} from './aiCourses.types';
import type { ProjectListFilters } from './queryKeys';

const API_ROOT = '/api/v1/learning-projects';
const projectPath = (projectId: string) => `${API_ROOT}/${encodeURIComponent(projectId)}`;

function compactParams(values: Record<string, string | number | boolean | undefined>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

export const aiCoursesApi = {
  async getLearningHome(cursor?: string): Promise<LearningHomeResponse> {
    const { data } = await api.get<LearningHomeResponse>('/api/v1/learning-home', {
      params: compactParams({ cursor }),
    });
    return data;
  },

  async listProjects(filters: ProjectListFilters = {}): Promise<CursorPage<LearningProjectListItem>> {
    const { data } = await api.get<CursorPage<LearningProjectListItem>>(`${API_ROOT}/me`, {
      params: compactParams({
        cursor: filters.cursor,
        limit: filters.limit,
        archived: filters.archived,
      }),
    });
    return data;
  },

  async getProject(projectId: string): Promise<LearningProjectDetail> {
    const { data } = await api.get<LearningProjectDetail>(projectPath(projectId));
    return data;
  },

  async createProject(
    input: CreateLearningProjectInput,
    idempotencyKey: string,
  ): Promise<CreateLearningProjectResponse> {
    const { data } = await api.post<CreateLearningProjectResponse>(API_ROOT, input, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return data;
  },

  async patchPlan(projectId: string, plan: EditableCoursePlan): Promise<LearningProjectDetail> {
    const { data } = await api.patch<LearningProjectDetail>(`${projectPath(projectId)}/plan`, plan);
    return data;
  },

  async approvePlan(projectId: string, planVersion: number): Promise<ApproveCoursePlanResponse> {
    const { data } = await api.post<ApproveCoursePlanResponse>(
      `${projectPath(projectId)}/plan/approve`,
      { planVersion },
    );
    return data;
  },

  async archiveProject(projectId: string): Promise<void> {
    await api.post(`${projectPath(projectId)}/archive`);
  },

  async restoreProject(projectId: string): Promise<LearningProjectDetail> {
    const { data } = await api.post<LearningProjectDetail>(`${projectPath(projectId)}/restore`);
    return data;
  },

  async getJob(projectId: string, jobId: string): Promise<AiGenerationJobView> {
    const { data } = await api.get<AiGenerationJobView>(
      `${projectPath(projectId)}/jobs/${encodeURIComponent(jobId)}`,
    );
    return data;
  },

  async retryJob(projectId: string, jobId: string): Promise<AiGenerationJobView> {
    const { data } = await api.post<AiGenerationJobView>(
      `${projectPath(projectId)}/jobs/${encodeURIComponent(jobId)}/retry`,
    );
    return data;
  },

  async getLessonContent(projectId: string, lessonId: string): Promise<LessonContentView> {
    const { data } = await api.get<LessonContentView>(
      `${projectPath(projectId)}/lessons/${encodeURIComponent(lessonId)}/content`,
    );
    return data;
  },

  async generateLessonContent(
    projectId: string,
    lessonId: string,
    mode: 'generate' | 'regenerate' = 'generate',
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<AiGenerationJobView> {
    const { data } = await api.post<AiGenerationJobView>(
      `${projectPath(projectId)}/lessons/${encodeURIComponent(lessonId)}/generate`,
      { mode },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data;
  },

  async createLessonVariant(
    projectId: string,
    lessonId: string,
    action: LessonVariantAction,
    blockId?: string,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<LessonVariantCreationResponse> {
    const { data } = await api.post<LessonVariantCreationResponse>(
      `${projectPath(projectId)}/lessons/${encodeURIComponent(lessonId)}/variants`,
      compactParams({ action, blockId }),
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data;
  },

  async updateActivity(projectId: string, input: LessonActivityInput): Promise<void> {
    await api.patch(`${projectPath(projectId)}/activity`, input);
  },

  async createAssessment(projectId: string, lessonId: string, idempotencyKey: string = crypto.randomUUID()): Promise<AssessmentCreationResponse> {
    const { data } = await api.post<AssessmentCreationResponse>(
      `${projectPath(projectId)}/lessons/${encodeURIComponent(lessonId)}/assessments`,
      undefined,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data;
  },

  async getAssessment(projectId: string, assessmentId: string): Promise<AssessmentView> {
    const { data } = await api.get<AssessmentView>(
      `${projectPath(projectId)}/assessments/${encodeURIComponent(assessmentId)}`,
    );
    return data;
  },

  async submitAssessmentAttempt(
    projectId: string,
    assessmentId: string,
    input: SubmitAssessmentAttemptInput,
  ): Promise<SubmitAssessmentAttemptResponse> {
    const { data } = await api.post<SubmitAssessmentAttemptResponse>(
      `${projectPath(projectId)}/assessments/${encodeURIComponent(assessmentId)}/attempts`,
      input,
    );
    return data;
  },

  async getAssessmentAttempt(
    projectId: string,
    assessmentId: string,
    attemptId: string,
  ): Promise<AssessmentAttemptView> {
    const { data } = await api.get<AssessmentAttemptView>(
      `${projectPath(projectId)}/assessments/${encodeURIComponent(assessmentId)}/attempts/${encodeURIComponent(attemptId)}`,
    );
    return data;
  },

  async listTutorSessions(projectId: string): Promise<{ items: TutorSessionView[] }> {
    const { data } = await api.get<{ items: TutorSessionView[] }>(`${projectPath(projectId)}/chat/sessions`);
    return data;
  },

  async createTutorSession(projectId: string, lessonId?: string): Promise<TutorSessionView> {
    const { data } = await api.post<TutorSessionView>(`${projectPath(projectId)}/chat/sessions`, { lessonId });
    return data;
  },

  async getTutorSession(projectId: string, sessionId: string): Promise<TutorSessionView> {
    const { data } = await api.get<TutorSessionView>(`${projectPath(projectId)}/chat/sessions/${encodeURIComponent(sessionId)}`, { params: { limit: 50 } });
    return data;
  },

  async sendTutorMessage(projectId: string, sessionId: string, content: string, lessonId?: string): Promise<TutorTurnResponse> {
    const { data } = await api.post<TutorTurnResponse>(`${projectPath(projectId)}/chat/sessions/${encodeURIComponent(sessionId)}/messages`, { content, lessonId });
    return data;
  },
};

export default aiCoursesApi;
