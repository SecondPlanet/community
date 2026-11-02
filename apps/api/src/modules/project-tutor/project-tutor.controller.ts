import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AiPersonalCoursesEnabledGuard } from '../../common/guards/ai-personal-courses-enabled.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CreateTutorSessionDto,
  SendTutorMessageDto,
  TutorMessagesQueryDto,
} from './project-tutor.dto';
import { ProjectTutorService } from './project-tutor.service';

interface AuthenticatedRequest {
  user: { userId: string; role: UserRole };
}

@ApiTags('project-tutor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AiPersonalCoursesEnabledGuard)
@Controller('learning-projects/:projectId/chat')
export class ProjectTutorController {
  constructor(private readonly service: ProjectTutorService) {}

  @Post('sessions')
  @ApiOperation({ summary: '创建私人课程 Tutor 会话' })
  createSession(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTutorSessionDto,
  ) {
    return this.service.createSession(projectId, req.user, dto);
  }

  @Get('sessions')
  @ApiOperation({ summary: '读取项目下当前用户的 Tutor 会话' })
  listSessions(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.service.listSessions(projectId, req.user);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '读取 Tutor 会话及最近消息' })
  getSession(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('sessionId') sessionId: string,
    @Query() query: TutorMessagesQueryDto,
  ) {
    return this.service.getSession(projectId, sessionId, req.user, query.limit);
  }

  @Post('sessions/:sessionId/messages')
  @Throttle({ short: { limit: 1, ttl: 1000 }, medium: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '向私人课程 Tutor 发送消息' })
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendTutorMessageDto,
  ) {
    return this.service.sendMessage(projectId, sessionId, req.user, dto);
  }
}
