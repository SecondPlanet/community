import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PointsService } from './points.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('points')
@Controller({ path: 'points', version: '1' })
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的积分、等级与最近流水' })
  async getMyPoints(@Request() req: any) {
    return this.pointsService.getUserPoints(req.user.userId);
  }
}
