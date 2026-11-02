import { BadRequestException } from '@nestjs/common';

export type VideoPlatform = 'youtube' | 'bilibili';

export interface ParsedVideoUrl {
  platform: VideoPlatform;
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

const BILIBILI_HOSTS = new Set([
  'bilibili.com',
  'www.bilibili.com',
  'm.bilibili.com',
  'b23.tv',
]);

export function parseVideoUrl(rawUrl: string): ParsedVideoUrl {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException('Invalid URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Only http/https URLs are supported');
  }

  const host = url.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    return parseYouTube(url);
  }
  if (BILIBILI_HOSTS.has(host)) {
    return parseBilibili(url);
  }
  throw new BadRequestException(
    `Unsupported platform: ${host}. Supported: youtube.com, youtu.be, bilibili.com`,
  );
}

function parseYouTube(url: URL): ParsedVideoUrl {
  let videoId: string | null = null;

  if (url.hostname === 'youtu.be') {
    videoId = url.pathname.replace(/^\//, '').split('/')[0] || null;
  } else if (url.pathname.startsWith('/watch')) {
    videoId = url.searchParams.get('v');
  } else if (url.pathname.startsWith('/embed/')) {
    videoId = url.pathname.split('/')[2] || null;
  } else if (url.pathname.startsWith('/shorts/')) {
    videoId = url.pathname.split('/')[2] || null;
  }

  if (!videoId || !/^[A-Za-z0-9_-]{6,15}$/.test(videoId)) {
    throw new BadRequestException('Could not extract YouTube video ID from URL');
  }
  return {
    platform: 'youtube',
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
  };
}

function parseBilibili(url: URL): ParsedVideoUrl {
  // /video/BVxxxxxxxxxx  or  /video/avxxxxxx
  const match = url.pathname.match(/\/video\/(BV[A-Za-z0-9]+|av\d+)/i);
  if (!match) {
    throw new BadRequestException('Could not extract Bilibili video ID from URL');
  }
  const id = match[1];
  // av 号是纯数字 (aid)。B 站播放器只认 bvid=BVxxx 或 aid=<数字>;
  // 拼成 bvid=av... 会加载失败, 所以 av 号必须转成 aid= 参数。
  const isAv = /^av\d+$/i.test(id);
  const embedUrl = isAv
    ? `https://player.bilibili.com/player.html?aid=${id.slice(2)}&autoplay=0`
    : `https://player.bilibili.com/player.html?bvid=${id}&autoplay=0`;
  return {
    platform: 'bilibili',
    videoId: id,
    canonicalUrl: `https://www.bilibili.com/video/${id}`,
    embedUrl,
  };
}