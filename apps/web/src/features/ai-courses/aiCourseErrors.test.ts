import { describe, expect, it } from 'vitest';
import { mapAiCourseError } from './aiCourseErrors';
import { contactHref } from '../../lib/contact';

describe('mapAiCourseError', () => {
  it('turns CONTENT_RESTRICTED into an editable-goal recovery with feedback', () => {
    const result = mapAiCourseError({ response: { status: 422, data: { code: 'CONTENT_RESTRICTED' } } });
    expect(result.message).toContain('修改');
    expect(result.feedbackHref).toBe(contactHref('AI 自建课程内容受限', 'AI 自建课程的内容生成被内容安全策略拦截，请协助处理。'));
  });

  it('keeps retry metadata for rate limits', () => {
    expect(mapAiCourseError({ response: { status: 429, data: { retryAfter: 12 } } })).toMatchObject({ retryAfterSeconds: 12 });
  });
});
