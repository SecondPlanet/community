import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseVideoUrl, ParsedVideoUrl } from './url-parser';
import { AiService } from '../ai/ai.service';

export interface VideoMetadata {
  title: string;
  authorName: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  embedUrl: string;
  platform: 'youtube' | 'bilibili';
  videoId: string;
}

export interface BatchImportResult {
  url: string;
  status: 'created' | 'duplicate' | 'failed';
  courseId?: string;
  error?: string;
}

const FETCH_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 1;

@Injectable()
export class UrlImportService {
  private readonly logger = new Logger(UrlImportService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  async importFromUrl(rawUrl: string): Promise<VideoMetadata> {
    const parsed = parseVideoUrl(rawUrl);
    const meta =
      parsed.platform === 'youtube'
        ? await this.fetchYouTube(parsed)
        : await this.fetchBilibili(parsed);

    if (parsed.platform === 'youtube') {
      meta.thumbnailUrl = `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`;
    } else if (parsed.platform === 'bilibili') {
      meta.thumbnailUrl = this.cleanBilibiliThumbnail(meta.thumbnailUrl);
    }

    return meta;
  }

  // Strip Bilibili's oss-process query params (which add watermarks / blur).
  // Final result is the original full-quality cover without the station watermark.
  private cleanBilibiliThumbnail(raw: string): string {
    if (!raw) return raw;
    try {
      const u = new URL(raw);
      u.searchParams.delete('x-oss-process');
      return u.toString();
    } catch {
      return raw;
    }
  }

  async buildCourseDraftFromMeta(meta: VideoMetadata) {
    const topic = `${meta.title} — ${meta.authorName}`.slice(0, 200);
    return this.aiService.generateCourse(topic, meta.description.slice(0, 500));
  }

  // Lookup whether the same source video has already been imported.
  async findExistingCourseByVideoUrl(canonicalUrl: string) {
    return this.prisma.course.findUnique({
      where: { sourceVideoUrl: canonicalUrl },
    });
  }

  async importMany(rawUrls: string[]): Promise<BatchImportResult[]> {
    const results: BatchImportResult[] = [];
    for (const rawUrl of rawUrls) {
      try {
        await this.importFromUrl(rawUrl);
        results.push({ url: rawUrl, status: 'created' });
        // Caller (controller) will turn the metadata into a draft course row
        // after this. We just confirm the fetch succeeded here.
      } catch (err) {
        results.push({
          url: rawUrl,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  private async fetchYouTube(parsed: ParsedVideoUrl): Promise<VideoMetadata> {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      parsed.canonicalUrl,
    )}&format=json`;
    const data = await this.safeFetchJson(url, 'YouTube oEmbed');
    return {
      title: String(data?.title ?? '').slice(0, 200),
      authorName: String(data?.author_name ?? '').slice(0, 100),
      description: '',
      thumbnailUrl: String(data?.thumbnail_url ?? ''),
      videoUrl: parsed.canonicalUrl,
      embedUrl: parsed.embedUrl,
      platform: 'youtube',
      videoId: parsed.videoId,
    };
  }

  private async fetchBilibili(parsed: ParsedVideoUrl): Promise<VideoMetadata> {
    // av 号链接的 API 用 aid=<数字> 而不是 bvid=av... (后者返回空 data)
    const isAv = /^av\d+$/i.test(parsed.videoId);
    const apiId = isAv ? parsed.videoId.slice(2) : parsed.videoId;
    const url = isAv
      ? `https://api.bilibili.com/x/web-interface/view?aid=${apiId}`
      : `https://api.bilibili.com/x/web-interface/view?bvid=${parsed.videoId}`;
    const data = await this.safeFetchJson(url, 'Bilibili API');

    const info = (data?.data ?? {}) as {
      title?: string;
      desc?: string;
      pic?: string;
      owner?: { name?: string };
    };
    return {
      title: String(info.title ?? '').slice(0, 200),
      authorName: String(info.owner?.name ?? '').slice(0, 100),
      description: String(info.desc ?? '').slice(0, 4000),
      thumbnailUrl: String(info.pic ?? ''),
      videoUrl: parsed.canonicalUrl,
      embedUrl: parsed.embedUrl,
      platform: 'bilibili',
      videoId: parsed.videoId,
    };
  }

  // Security: SSRF protection — only call the hard-coded upstream APIs, never
  // forward the user-supplied URL directly. Also enforce a short timeout and
  // retry transient failures once.
  private async safeFetchJson(
    url: string,
    label: string,
  ): Promise<Record<string, unknown>> {
    const allowedHosts = new Set([
      'www.youtube.com',
      'i.ytimg.com',
      'api.bilibili.com',
    ]);
    const target = new URL(url);
    if (!allowedHosts.has(target.hostname)) {
      throw new BadRequestException(
        `Refusing to call non-allowlisted host: ${target.hostname}`,
      );
    }

    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SecondPlanet-Importer/1.0',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
        });
        if (!res.ok) {
          // Don't retry on 4xx — those are deterministic client errors.
          if (res.status >= 500 && attempt < MAX_RETRIES) {
            lastErr = new Error(`${label} responded ${res.status}`);
            await this.sleep(RETRY_DELAY_MS);
            continue;
          }
          throw new BadRequestException(`${label} responded ${res.status}`);
        }
        return (await res.json()) as Record<string, unknown>;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          lastErr = new Error(`${label} timed out after ${FETCH_TIMEOUT_MS}ms`);
        } else if (err instanceof BadRequestException) {
          throw err;
        } else {
          lastErr = err;
        }
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    this.logger.error(`${label} fetch failed`, lastErr as Error);
    throw new BadRequestException(
      `${label} unreachable after ${MAX_RETRIES + 1} attempts`,
    );
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
