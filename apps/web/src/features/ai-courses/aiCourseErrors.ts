import { contactHref } from '../../lib/contact';

export interface AiCourseErrorView {
  message: string;
  code?: string;
  retryAfterSeconds?: number;
  feedbackHref?: string;
}

export function mapAiCourseError(error: unknown): AiCourseErrorView {
  const response = (error as { response?: { status?: number; data?: { code?: string; message?: string; retryAfter?: number } } }).response;
  const code = response?.data?.code;
  if (code === 'CONTENT_RESTRICTED') {
    return {
      code,
      message: '这个学习目标暂时无法生成。请修改问题或学习目标后再试。',
      feedbackHref: contactHref(
        'AI 自建课程内容受限',
        'AI 自建课程的内容生成被内容安全策略拦截，请协助处理。',
      ),
    };
  }
  if (response?.status === 409) return { code, message: '内容已在另一处更新，请先载入最新版本。' };
  if (response?.status === 429) return { code, message: 'AI 请求较多，请稍后再试。', retryAfterSeconds: response.data?.retryAfter ?? 30 };
  if (response?.status === 503) return { code, message: 'AI 服务暂时不可用，请稍后重试。' };
  return { code, message: response?.data?.message ?? '操作没有成功，请稍后重试。' };
}
