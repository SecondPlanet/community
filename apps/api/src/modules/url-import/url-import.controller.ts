import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UrlImportService } from './url-import.service';
import { ImportFromUrlDto, BatchImportFromUrlDto } from './url-import.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CoursesService } from '../courses/courses.service';
import { parseVideoUrl } from './url-parser';

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class UrlImportController {
  constructor(
    private readonly urlImport: UrlImportService,
    private readonly coursesService: CoursesService,
  ) {}

  // Security: tight rate limit so an admin cannot accidentally DoS upstream
  // YouTube / Bilibili APIs or burn through the Gemini quota.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('import-from-url')
  async importFromUrl(@Body() dto: ImportFromUrlDto) {
    const parsed = parseVideoUrl(dto.url);
    const existing = await this.urlImport.findExistingCourseByVideoUrl(
      parsed.canonicalUrl,
    );
    if (existing) {
      return {
        status: 'duplicate' as const,
        meta: null,
        draft: null,
        course: existing,
      };
    }

    const meta = await this.urlImport.importFromUrl(dto.url);
    const draft = await this.urlImport.buildCourseDraftFromMeta(meta);

    const created = await this.coursesService.create({
      title: draft.title,
      description: draft.description,
      learningPoints: draft.learningPoints,
      instructor: draft.instructor,
      level: draft.level,
      duration: draft.duration,
      thumbnail: meta.thumbnailUrl || draft.thumbnail,
      tags: draft.tags,
      costType: draft.costType,
      price: draft.price,
      sourceVideoUrl: meta.videoUrl,
      sourcePlatform: meta.platform,
    });

    return {
      status: 'created' as const,
      meta,
      draft,
      course: created,
    };
  }

  // Batch import — sequential to keep within upstream API quotas. Each URL
  // is independent: a failure for one does not abort the rest.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('import-batch-from-urls')
  async importBatch(@Body() dto: BatchImportFromUrlDto) {
    const results: Array<{
      url: string;
      status: 'created' | 'duplicate' | 'failed';
      courseId?: string;
      error?: string;
      draftTitle?: string;
    }> = [];

    for (const rawUrl of dto.urls) {
      try {
        const parsed = parseVideoUrl(rawUrl);
        const existing =
          await this.urlImport.findExistingCourseByVideoUrl(parsed.canonicalUrl);
        if (existing) {
          results.push({
            url: rawUrl,
            status: 'duplicate',
            courseId: existing.id,
          });
          continue;
        }
        const meta = await this.urlImport.importFromUrl(rawUrl);
        const draft = await this.urlImport.buildCourseDraftFromMeta(meta);
        const created = await this.coursesService.create({
          title: draft.title,
          description: draft.description,
          learningPoints: draft.learningPoints,
          instructor: draft.instructor,
          level: draft.level,
          duration: draft.duration,
          thumbnail: meta.thumbnailUrl || draft.thumbnail,
          tags: draft.tags,
          costType: draft.costType,
          price: draft.price,
          sourceVideoUrl: meta.videoUrl,
          sourcePlatform: meta.platform,
        });
        results.push({
          url: rawUrl,
          status: 'created',
          courseId: created.id,
          draftTitle: draft.title,
        });
      } catch (err) {
        results.push({
          url: rawUrl,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      duplicate: results.filter((r) => r.status === 'duplicate').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    };
  }
}