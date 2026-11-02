import { describe, expect, it } from 'vitest';
import { isDirectVideoUrl, normalizeEmbeddedVideoUrl } from './videoUrl';
import { withResumeStart } from '../features/dashboard/PlatformLearningContainer';

describe('videoUrl', () => {
  it('recognizes directly playable media files', () => {
    expect(isDirectVideoUrl('https://cdn.example.org/course/lesson.mp4?token=abc')).toBe(true);
    expect(isDirectVideoUrl('https://www.youtube.com/embed/video-id')).toBe(false);
  });

  it('normalizes YouTube page and short links with enablejsapi=1', () => {
    // v1.9-alpha.2 (batch-10 A-09): embed URL 必带 enablejsapi=1 + origin
    // (用于 postMessage 续播协议)。
    const a = normalizeEmbeddedVideoUrl('https://www.youtube.com/watch?v=abc123');
    expect(a).toContain('/embed/abc123');
    expect(a).toContain('enablejsapi=1');

    const b = normalizeEmbeddedVideoUrl('https://youtu.be/abc123');
    expect(b).toContain('/embed/abc123');
    expect(b).toContain('enablejsapi=1');
  });

  it('preserves user t= / start= param when normalizing YouTube', () => {
    const a = normalizeEmbeddedVideoUrl('https://www.youtube.com/watch?v=abc123&t=42');
    expect(a).toContain('start=42');
  });

  it('normalizes Bilibili video pages', () => {
    expect(normalizeEmbeddedVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD',
    );
  });

  it('normalizes Bilibili av-number video pages to aid embed', () => {
    expect(normalizeEmbeddedVideoUrl('https://www.bilibili.com/video/av170001')).toBe(
      'https://player.bilibili.com/player.html?aid=170001',
    );
  });
});

// v1.9-alpha.2 (batch-10 A-09): 续播 start= helper
describe('withResumeStart', () => {
  const ytSrc = 'https://www.youtube.com/embed/abc?enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A3000';
  it('null → 不变', () => {
    expect(withResumeStart(ytSrc, null)).toBe(ytSrc);
  });

  it('≤5 秒 → 不变 (短内容不续播)', () => {
    expect(withResumeStart(ytSrc, 3)).toBe(ytSrc);
  });

  it('>5 秒 → 加 start=', () => {
    expect(withResumeStart(ytSrc, 123)).toContain('start=123');
  });

  it('已带 start= → 不覆盖', () => {
    const a = 'https://www.youtube.com/embed/abc?start=99';
    expect(withResumeStart(a, 50)).toBe(a);
  });

  it('非 YouTube 源 → 不变', () => {
    const b = 'https://player.bilibili.com/player.html?bvid=BV1';
    expect(withResumeStart(b, 100)).toBe(b);
  });
});
