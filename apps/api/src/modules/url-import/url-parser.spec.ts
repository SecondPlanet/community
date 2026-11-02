import { parseVideoUrl } from './url-parser';

describe('parseVideoUrl', () => {
  describe('YouTube', () => {
    it('parses youtube.com /watch?v=ID', () => {
      const r = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(r.platform).toBe('youtube');
      expect(r.videoId).toBe('dQw4w9WgXcQ');
      expect(r.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('parses youtu.be short link', () => {
      const r = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(r.platform).toBe('youtube');
      expect(r.videoId).toBe('dQw4w9WgXcQ');
    });

    it('parses /shorts/ link', () => {
      const r = parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(r.platform).toBe('youtube');
      expect(r.videoId).toBe('dQw4w9WgXcQ');
    });

    it('rejects youtube URL with bad ID', () => {
      expect(() => parseVideoUrl('https://www.youtube.com/watch?v=xx')).toThrow();
    });
  });

  describe('Bilibili', () => {
    it('parses BV id', () => {
      const r = parseVideoUrl('https://www.bilibili.com/video/BV1xx411c7mD');
      expect(r.platform).toBe('bilibili');
      expect(r.videoId).toBe('BV1xx411c7mD');
      expect(r.embedUrl).toContain('bvid=BV1xx411c7mD');
    });

    it('parses av id', () => {
      const r = parseVideoUrl('https://www.bilibili.com/video/av170001');
      expect(r.platform).toBe('bilibili');
      expect(r.videoId).toBe('av170001');
      // av 号必须转成 aid=, 拼 bvid=av... 播放器会加载失败
      expect(r.embedUrl).toBe('https://player.bilibili.com/player.html?aid=170001&autoplay=0');
    });
  });

  describe('SSRF guards', () => {
    it('rejects non-http protocols', () => {
      expect(() => parseVideoUrl('file:///etc/passwd')).toThrow();
      expect(() => parseVideoUrl('javascript:alert(1)')).toThrow();
    });

    it('rejects unsupported host', () => {
      expect(() => parseVideoUrl('https://example.com/')).toThrow();
    });

    it('rejects invalid URL', () => {
      expect(() => parseVideoUrl('not a url')).toThrow();
    });
  });
});