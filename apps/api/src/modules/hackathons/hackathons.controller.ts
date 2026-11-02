import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { HackathonsService } from './hackathons.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, HackathonStatus } from '@prisma/client';
import {
  CreateHackathonDto,
  UpdateHackathonDto,
  CreateTeamDto,
  CreateSubmissionDto,
  UpdateSubmissionDto,
  CreateAnnouncementDto,
  CreateJudgeDto,
  UpdateJudgeDto,
  CreateSponsorDto,
  UpdateSponsorDto,
  JudgeSubmissionDto,
  RegisterHackathonDto,
  ListRegistrationsDto,
  ReviewRegistrationDto,
} from './hackathons.dto';

@ApiTags('hackathons')
@Controller({ path: 'hackathons', version: '1' })
export class HackathonsController {
  constructor(private readonly hackathonsService: HackathonsService) {}

  private getUserId(req: any): string | undefined {
    return req?.user?.userId;
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取黑客松列表' })
  @ApiQuery({ name: 'status', required: false, enum: HackathonStatus })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('status') status?: HackathonStatus,
    @Query('search') search?: string,
    @Request() req?: any,
  ) {
    return this.hackathonsService.findAll({
      status,
      search,
      userId: req ? this.getUserId(req) : undefined,
    });
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '获取黑客松详情' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.hackathonsService.findOne(id, this.getUserId(req));
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建黑客松（管理员）' })
  async create(@Body() dto: CreateHackathonDto, @Request() req: any) {
    return this.hackathonsService.create(dto, this.getUserId(req)!);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新黑客松（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateHackathonDto,
  ) {
    return this.hackathonsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除黑客松（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async delete(@Param('id') id: string) {
    return this.hackathonsService.delete(id);
  }

  // 报名
  @Post(':id/register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '报名黑客松' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async register(
    @Param('id') id: string,
    @Body() dto: RegisterHackathonDto,
    @Request() req: any,
  ) {
    return this.hackathonsService.register(this.getUserId(req)!, id, dto.answers);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消报名' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async cancelRegistration(@Param('id') id: string, @Request() req: any) {
    return this.hackathonsService.cancelRegistration(this.getUserId(req)!, id);
  }

  @Get(':id/my-registration')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户报名状态' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async getMyRegistration(@Param('id') id: string, @Request() req: any) {
    return this.hackathonsService.getMyRegistration(this.getUserId(req)!, id);
  }

  @Get(':id/registrations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '报名审核列表（管理员）' })
  async listRegistrations(@Param('id') id: string, @Query() query: ListRegistrationsDto) {
    return this.hackathonsService.listRegistrations(id, query);
  }

  @Patch(':id/registrations/:registrationId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审核报名（管理员）' })
  async reviewRegistration(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: ReviewRegistrationDto,
    @Request() req: any,
  ) {
    return this.hackathonsService.reviewRegistration(
      id,
      registrationId,
      dto,
      this.getUserId(req)!,
    );
  }

  @Get(':id/registrations/:registrationId/attachments/:fieldId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取报名附件下载地址' })
  async getRegistrationAttachment(
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Param('fieldId') fieldId: string,
    @Request() req: any,
  ) {
    return this.hackathonsService.getRegistrationAttachmentUrl(req.user, id, registrationId, fieldId);
  }

  // 公告
  @Get(':id/announcements')
  @ApiOperation({ summary: '获取黑客松公告' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async getAnnouncements(@Param('id') id: string) {
    return this.hackathonsService.getAnnouncements(id);
  }

  @Post(':id/announcements')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发布公告（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async createAnnouncement(
    @Param('id') id: string,
    @Body() dto: CreateAnnouncementDto,
    @Request() req: any,
  ) {
    return this.hackathonsService.createAnnouncement(
      id,
      dto,
      this.getUserId(req)!,
    );
  }

  // 队伍
  @Get(':id/teams')
  @ApiOperation({ summary: '获取队伍列表' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async getTeams(@Param('id') id: string) {
    return this.hackathonsService.getTeams(id);
  }

  @Post(':id/teams')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建队伍' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async createTeam(
    @Param('id') id: string,
    @Body() dto: CreateTeamDto,
    @Request() req: any,
  ) {
    return this.hackathonsService.createTeam(this.getUserId(req)!, id, dto);
  }

  @Post(':id/teams/:teamId/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '加入队伍' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'teamId', description: '队伍ID' })
  async joinTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Request() req: any,
  ) {
    return this.hackathonsService.joinTeam(this.getUserId(req)!, id, teamId);
  }

  @Post(':id/teams/:teamId/leave')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '退出队伍' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'teamId', description: '队伍ID' })
  async leaveTeam(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Request() req: any,
  ) {
    return this.hackathonsService.leaveTeam(this.getUserId(req)!, id, teamId);
  }

  // 作品
  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的作品' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async getMySubmissions(@Param('id') id: string, @Request() req: any) {
    return this.hackathonsService.getMySubmissions(this.getUserId(req)!, id);
  }

  @Get(':id/submissions/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有作品（管理员/评委）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async getAllSubmissions(@Param('id') id: string) {
    return this.hackathonsService.getAllSubmissions(id);
  }

  @Post(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建作品' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async createSubmission(
    @Param('id') id: string,
    @Body() dto: CreateSubmissionDto,
    @Request() req: any,
  ) {
    return this.hackathonsService.createSubmission(this.getUserId(req)!, id, dto);
  }

  @Patch(':id/submissions/:submissionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新作品' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'submissionId', description: '作品ID' })
  async updateSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdateSubmissionDto,
    @Request() req: any,
  ) {
    return this.hackathonsService.updateSubmission(
      this.getUserId(req)!,
      id,
      submissionId,
      dto,
    );
  }

  @Get(':id/submissions/:submissionId/attachments/:index')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取作品附件下载地址' })
  async getSubmissionAttachment(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Param('index', ParseIntPipe) index: number,
    @Request() req: any,
  ) {
    return this.hackathonsService.getSubmissionAttachmentUrl(req.user, id, submissionId, index);
  }

  @Post(':id/submissions/:submissionId/judge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '作品评分（管理员/评委）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'submissionId', description: '作品ID' })
  async judgeSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: JudgeSubmissionDto,
    @Request() req: any,
  ) {
    return this.hackathonsService.judgeSubmission(id, submissionId, dto, this.getUserId(req));
  }

  // ==================== P1 修复(2026-07-24): Judges CRUD ====================

  @Get(':id/judges')
  @ApiOperation({ summary: '列出黑客松评委' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async listJudges(@Param('id') id: string) {
    return this.hackathonsService.listJudges(id);
  }

  @Post(':id/judges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '新增评委（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async addJudge(@Param('id') id: string, @Body() body: CreateJudgeDto) {
    return this.hackathonsService.addJudge(id, body);
  }

  @Patch(':id/judges/:judgeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新评委（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'judgeId', description: '评委ID' })
  async updateJudge(
    @Param('id') id: string,
    @Param('judgeId') judgeId: string,
    @Body() body: UpdateJudgeDto,
  ) {
    return this.hackathonsService.updateJudge(id, judgeId, body);
  }

  @Delete(':id/judges/:judgeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除评委（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'judgeId', description: '评委ID' })
  async removeJudge(@Param('id') id: string, @Param('judgeId') judgeId: string) {
    return this.hackathonsService.removeJudge(id, judgeId);
  }

  // ==================== P1 修复(2026-07-24): Sponsors CRUD ====================

  @Get(':id/sponsors')
  @ApiOperation({ summary: '列出黑客松赞助商' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async listSponsors(@Param('id') id: string) {
    return this.hackathonsService.listSponsors(id);
  }

  @Post(':id/sponsors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '新增赞助商（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  async addSponsor(@Param('id') id: string, @Body() body: CreateSponsorDto) {
    return this.hackathonsService.addSponsor(id, body);
  }

  @Patch(':id/sponsors/:sponsorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新赞助商（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'sponsorId', description: '赞助商ID' })
  async updateSponsor(
    @Param('id') id: string,
    @Param('sponsorId') sponsorId: string,
    @Body() body: UpdateSponsorDto,
  ) {
    return this.hackathonsService.updateSponsor(id, sponsorId, body);
  }

  @Delete(':id/sponsors/:sponsorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除赞助商（管理员）' })
  @ApiParam({ name: 'id', description: '黑客松ID' })
  @ApiParam({ name: 'sponsorId', description: '赞助商ID' })
  async removeSponsor(@Param('id') id: string, @Param('sponsorId') sponsorId: string) {
    return this.hackathonsService.removeSponsor(id, sponsorId);
  }
}
