import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserRole } from '@prisma/client';

@ApiTags('progress')
@Controller({ path: 'progress', version: '1' })
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的全部学习进度' })
  async getMyProgress(@Request() req: any) {
    return this.progressService.getMyProgress(req.user.userId);
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的学习统计（仪表盘）' })
  async getMyStats(@Request() req: any) {
    return this.progressService.getLearningStats(req.user.userId);
  }

  @Get('courses/:courseId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我在某课程的进度' })
  @ApiParam({ name: 'courseId', description: '课程ID' })
  async getCourseProgress(
    @Request() req: { user: { userId: string; role?: UserRole } },
    @Param('courseId') courseId: string,
  ) {
    return this.progressService.getCourseProgress(
      req.user.userId,
      courseId,
      req.user.role,
    );
  }

  @Post('lessons/:lessonId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '标记课时完成' })
  @ApiParam({ name: 'lessonId', description: '课时ID' })
  async completeLesson(
    @Request() req: { user: { userId: string; role?: UserRole } },
    @Param('lessonId') lessonId: string,
  ) {
    return this.progressService.completeLesson(
      req.user.userId,
      lessonId,
      req.user.role,
    );
  }
}
