import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { EnrollmentsService } from './enrollments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserRole } from '@prisma/client';

@ApiTags('enrollments')
@ApiBearerAuth()
@Controller('enrollments')
@UseGuards(JwtAuthGuard)
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get('me')
  @ApiOperation({ summary: '获取我的全部注册记录' })
  async getMyEnrollments(@Request() req: { user: { userId: string } }) {
    return this.enrollmentsService.findByUser(req.user.userId);
  }

  @Post('courses/:id/free')
  @ApiOperation({ summary: '注册免费课程' })
  @ApiParam({ name: 'id', description: '课程ID' })
  async enrollFreeCourse(
    @Request() req: { user: { userId: string; role?: UserRole } },
    @Param('id') courseId: string,
  ) {
    return this.enrollmentsService.enrollFreeCourse(
      req.user.userId,
      courseId,
      req.user.role,
    );
  }
}
