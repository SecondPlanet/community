import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LearningHomeService } from './learning-home.service';

@ApiTags('learning-home')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('learning-home')
export class LearningHomeController {
  constructor(private readonly service: LearningHomeService) {}

  @Get()
  @ApiOperation({ summary: '聚合当前用户最近学习的公开课程和 AI 私人课程' })
  getHome(
    @Req() req: { user: { userId: string } },
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getHome(req.user.userId, cursor);
  }
}
