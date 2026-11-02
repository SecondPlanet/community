export function isDirectVideoUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return /\.(mp4|webm|ogg|mov|m4v)$/.test(pathname);
  } catch {
    return false;
  }
}

export function normalizeEmbeddedVideoUrl(value: string): string {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    // v1.9-alpha.2 (batch-10 A-09): YouTube embed 加 enablejsapi=1 + origin
    // 用于 postMessage 协议(infoDelivery.currentTime + listening)。CSP 不动。
    const ytOrigin =
      typeof window !== 'undefined' ? window.location.origin : '';
    if (hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      if (!id) return value;
      return `https://www.youtube.com/embed/${encodeURIComponent(id)}?enablejsapi=1&origin=${encodeURIComponent(ytOrigin)}`;
    }
    if (hostname === 'youtube.com' || hostname === 'www.youtube.com' || hostname === 'm.youtube.com') {
      const id = url.searchParams.get('v');
      if (!id) return value;
      // 保留原 query(t / start 等续播参数)
      const start = url.searchParams.get('t') ?? url.searchParams.get('start');
      const params = new URLSearchParams();
      params.set('enablejsapi', '1');
      params.set('origin', ytOrigin);
      if (start) params.set('start', start);
      return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params.toString()}`;
    }
    // v1.9-alpha.2 (batch-10 A-09): ⛔ Bilibili 没有公开进度 API / postMessage 协议,
    // 课时不参与续播追踪。详见 plan/CLAUDE-REVIEW-2026-09-13.md。
    if (hostname === 'bilibili.com' || hostname === 'www.bilibili.com' || hostname === 'm.bilibili.com') {
      const bv = url.pathname.match(/\/video\/(BV[\w]+)/i);
      if (bv) return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bv[1])}`;
      const av = url.pathname.match(/\/video\/(av\d+)/i);
      if (av) return `https://player.bilibili.com/player.html?aid=${av[1].slice(2)}`;
    }
    return value;
  } catch {
    return value;
  }
}