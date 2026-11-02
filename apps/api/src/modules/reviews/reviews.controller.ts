/**
 * reviews.controller.ts — P1-3 评价路由
 *
 * 三个路由:
 *   - GET  /api/v1/courses/:id/reviews    公开(列表)
 *   - POST /api/v1/courses/:id/reviews    登录(写评价)
 *   - POST /api/v1/reviews/:id/helpful    登录(点赞)
 *
 * 注意:POST 写评价的 path 是 /api/v1/courses/:id/reviews
 *      (跟课程 detail 同 namespace 表达"是这门课的评价")
 *      点赞是单条评价维度的操作,挂 /api/v1/reviews/:id/helpful
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import {
  AdminListReviewsQueryDto,
  CreateReviewDto,
  ListReviewsQueryDto,
} from './reviews.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

interface AuthedRequest {
  user: { userId: string; role?: string };
}

@ApiTags('reviews')
@Controller({ path: 'courses', version: '1' })
export class CoursesReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':id/reviews')
  @ApiOperation({ summary: '获取课程评价列表（公开）' })
  @ApiParam({ name: 'id', description: '课程ID' })
  async list(
    @Param('id') courseId: string,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviewsService.findByCourse(
      courseId,
      query.page ?? 1,
      query.limit ?? 10,
    );
  }

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  // P0 (audit v1.5.0 P2-1): 写评价靠全局 5/sec 兜底太松, 攻击者 1 凭证可 5 req/sec
  // 刷评价. 对比 :79 helpful 已加 medium 10/60s, POST 反而更危险却不限流.
  // 改: 短窗 1/3s 防双击, 中窗 10/60s 限制刷评价速率
  @Throttle({ short: { limit: 1, ttl: 3000 }, medium: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '写课程评价（登录用户）' })
  @ApiParam({ name: 'id', description: '课程ID' })
  async create(
    @Param('id') courseId: string,
    @Req() req: AuthedRequest,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(req.user.userId, courseId, dto, req.user.role as UserRole | undefined);
  }
}

@ApiTags('reviews')
@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(':id/helpful')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  // P1-7: 限流 — 单用户 10 次/分钟 防止刷 helpful 计数
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '给评价点赞（登录用户）' })
  @ApiParam({ name: 'id', description: '评价ID' })
  async helpful(
    @Param('id') reviewId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.reviewsService.markHelpful(req.user.userId, reviewId, req.user.role as UserRole | undefined);
  }

  /**
   * P1-3 admin 全量评价列表
   * GET /api/v1/reviews?page=1&limit=20&courseId=...&rating=5&onlyDeleted=false
   * 给 AdminReviewsPage 用:列全站评价 + 一键软删
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '全量评价列表（管理员）' })
  @ApiQuery({ name: 'page', required: false, description: '页码（默认 1）' })
  @ApiQuery({ name: 'limit', required: false, description: '每页大小（默认 20）' })
  @ApiQuery({ name: 'courseId', required: false, description: '按课程过滤' })
  @ApiQuery({ name: 'rating', required: false, description: '按评分过滤（1-5）' })
  @ApiQuery({ name: 'onlyDeleted', required: false, description: '只显示已软删评价' })
  async findAll(@Query() query: AdminListReviewsQueryDto) {
    return this.reviewsService.findAll({
      page: query.page,
      limit: query.limit,
      courseId: query.courseId,
      rating: query.rating,
      onlyDeleted: query.onlyDeleted,
    });
  }

  /**
   * P1-3 admin 软删评价(content 置空 + 隐藏,不物理删保留审计)
   * 原因:合规要求保留用户行为痕迹;且有用作 review 训练数据
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '软删评价（管理员；保留审计）' })
  @ApiParam({ name: 'id', description: '评价ID' })
  async adminRemove(@Param('id') id: string) {
    return this.reviewsService.adminRemove(id);
  }
}
