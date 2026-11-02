/**
 * uploads.service.ts — 上传 sign + complete 业务
 *
 * 2026-07-24: P0 — 视频上传管道
 *
 * sign 流程:
 *   1) 校验 scope 存在 + 用户 role 在 allowedRoles
 *   2) 校验 mime 在 allowedMime, size <= maxSizeMB
 *   3) 生成 key = `<keyPrefix>/<userId>/<timestamp>-<random>-<filename>`
 *   4) 调 storage.presignUpload
 *
 * complete 流程:
 *   1) 校验 key 之前是当前 user 签过的 (按 userId 前缀)
 *   2) 校验 refId 存在 + 权限 (e.g. lesson 只能 admin 改)
 *   3) 把 publicUrl 写到目标列
 *   4) 返回 { url, publicUrl }
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresignResult } from './storage/storage.interface';
import { S3StorageService } from './storage/s3-storage.service';
import { UPLOAD_SCOPES, UploadScope } from './uploads.config';
import { CompleteUploadDto, SignUploadDto } from './uploads.dto';
import { randomBytes } from 'crypto';
import { extname } from 'path';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {}

  private generateKey(scope: UploadScope, userId: string, filename: string, refId?: string): string {
    const cfg = UPLOAD_SCOPES[scope];
    // 保留扩展名 (小写), 防止 mime spoof
    const ext = extname(filename).toLowerCase().slice(0, 8); // cap length
    const safeExt = /^[.a-z0-9]+$/.test(ext) ? ext : '';
    const ts = Date.now();
    const rand = randomBytes(6).toString('hex');
    const ownerPath = cfg.publicRead ? userId : `${refId}/${userId}`;
    return `${cfg.keyPrefix}/${ownerPath}/${ts}-${rand}${safeExt}`;
  }

  async sign(
    dto: SignUploadDto,
    user: { userId: string; role: string },
  ): Promise<PresignResult & { scope: UploadScope }> {
    const cfg = UPLOAD_SCOPES[dto.scope];
    if (!cfg) {
      throw new BadRequestException(`Unknown upload scope: ${dto.scope}`);
    }
    // role 权限
    if (!cfg.allowedRoles.includes(user.role as any)) {
      throw new ForbiddenException(
        `Role ${user.role} 不允许上传 ${dto.scope} (需要: ${cfg.allowedRoles.join(', ')})`,
      );
    }
    // mime 校验
    if (!cfg.allowedMime.includes(dto.mimeType)) {
      throw new BadRequestException(
        `${dto.scope} 不接受 ${dto.mimeType} (允许: ${cfg.allowedMime.join(', ')})`,
      );
    }
    // size 校验
    const maxBytes = cfg.maxSizeMB * 1024 * 1024;
    if (dto.size > maxBytes) {
      throw new BadRequestException(
        `${dto.scope} 文件 ${dto.size} 字节超过上限 ${cfg.maxSizeMB}MB`,
      );
    }

    const key = this.generateKey(dto.scope, user.userId, dto.filename, dto.refId);

    // 如果给了 refId, 校验 refId 存在 + 用户有权限 — 防 user 拿任意 entity id 签 key
    // 业务侧 confirm 还要再校验一次, 这里只是 fail-fast
    if (dto.refId) {
      await this.validateRefIdForSign(dto.scope, dto.refId, user);
    } else if (!cfg.publicRead) {
      throw new BadRequestException(`${dto.scope} 必须传 hackathonId 作为 refId`);
    }

    const presigned = await this.storage.presignUpload(key, dto.mimeType, cfg.presignTtlSec, cfg.publicRead);


    return { ...presigned, scope: dto.scope };
  }

  /**
   * sign 时 fail-fast 校验 refId 存在 + 权限 (防 user 拿任意 entity id 签)
   * 不写库, 仅仅检查
   */
  private async validateRefIdForSign(
    scope: UploadScope,
    refId: string,
    user: { userId: string; role: string },
  ): Promise<void> {
    const isAdmin = user.role === 'admin';
    switch (scope) {
      case 'lesson-video': {
        if (!isAdmin) throw new ForbiddenException('仅 admin 可上传 lesson 视频');
        const l = await this.prisma.lesson.findUnique({ where: { id: refId } });
        if (!l || l.deletedAt) throw new NotFoundException(`Lesson ${refId} 不存在`);
        return;
      }
      case 'resource': {
        // create 时上传, refId = lessonId (parent). 校验 lesson 存在
        if (!isAdmin) throw new ForbiddenException('仅 admin 可上传 resource');
        const l = await this.prisma.lesson.findUnique({ where: { id: refId } });
        if (!l || l.deletedAt) throw new NotFoundException(`Lesson ${refId} 不存在`);
        return;
      }
      case 'course-thumbnail': {
        if (!isAdmin) throw new ForbiddenException('仅 admin 可上传 course 封面');
        const c = await this.prisma.course.findUnique({ where: { id: refId } });
        if (!c) throw new NotFoundException(`Course ${refId} 不存在`);
        return;
      }
      case 'degree-thumbnail': {
        if (!isAdmin) throw new ForbiddenException('仅 admin 可上传 degree 封面');
        const d = await this.prisma.nanoDegree.findUnique({ where: { id: refId } });
        if (!d) throw new NotFoundException(`Degree ${refId} 不存在`);
        return;
      }
      case 'hackathon-banner': {
        if (!isAdmin) throw new ForbiddenException('仅 admin 可上传 hackathon banner');
        const h = await this.prisma.hackathon.findUnique({ where: { id: refId } });
        if (!h) throw new NotFoundException(`Hackathon ${refId} 不存在`);
        return;
      }
      case 'hackathon-judge-avatar': {
        if (!isAdmin) throw new ForbiddenException('仅 admin 可上传 judge avatar');
        const j = await this.prisma.judge.findUnique({ where: { id: refId } });
        if (!j) throw new NotFoundException(`Judge ${refId} 不存在`);
        return;
      }
      case 'hackathon-sponsor-logo': {
        if (!isAdmin) throw new ForbiddenException('仅 admin 可上传 sponsor logo');
        const s = await this.prisma.sponsor.findUnique({ where: { id: refId } });
        if (!s) throw new NotFoundException(`Sponsor ${refId} 不存在`);
        return;
      }
      case 'hackathon-application-file': {
        const h = await this.prisma.hackathon.findUnique({ where: { id: refId } });
        if (!h) throw new NotFoundException(`Hackathon ${refId} 不存在`);
        if (h.registrationMode !== 'internal') throw new BadRequestException('外部报名不接受站内附件');
        if (h.status === 'cancelled') throw new ForbiddenException('该黑客松已取消');
        if (h.registerDeadline && new Date() > h.registerDeadline) {
          throw new ForbiddenException('报名已截止');
        }
        return;
      }
      case 'submission-attachment': {
        const h = await this.prisma.hackathon.findUnique({ where: { id: refId } });
        if (!h) throw new NotFoundException(`Hackathon ${refId} 不存在`);
        if (h.status === 'cancelled') throw new ForbiddenException('该黑客松已取消');
        if (h.submissionDeadline && new Date() > h.submissionDeadline) {
          throw new BadRequestException('提交已截止');
        }
        if (!isAdmin) {
          const registration = await this.prisma.hackathonRegistration.findUnique({
            where: { hackathonId_userId: { hackathonId: refId, userId: user.userId } },
          });
          if (registration?.status === 'cancelled' || registration?.reviewStatus !== 'approved') {
            throw new ForbiddenException('请先完成报名审核');
          }
        }
        return;
      }
      case 'submission-video': {
        const sub = await this.findOwnedSubmission(refId, user);
        if (!sub) throw new NotFoundException(`Submission ${refId} 不存在`);
        return;
      }
      case 'user-avatar': {
        if (!isAdmin && refId !== user.userId) {
          throw new ForbiddenException('只能改自己的头像');
        }
        const u = await this.prisma.user.findUnique({ where: { id: refId } });
        if (!u) throw new NotFoundException(`User ${refId} 不存在`);
        return;
      }
      default:
        throw new BadRequestException(`Unknown scope ${scope}`);
    }
  }

  async complete(
    dto: CompleteUploadDto,
    user: { userId: string; role: string },
  ): Promise<{
    url?: string;
    publicUrl?: string;
    key: string;
    name: string;
    size: number;
    mimeType: string;
    writtenBack: boolean;
  }> {
    const cfg = UPLOAD_SCOPES[dto.scope];
    if (!cfg) {
      throw new BadRequestException(`Unknown upload scope: ${dto.scope}`);
    }
    if (!cfg.publicRead && !dto.refId) {
      throw new BadRequestException(`${dto.scope} 必须传 hackathonId 作为 refId`);
    }
    // 私有 key 同时绑定 hackathonId + userId，防止跨活动/跨用户引用。
    const ownerPath = cfg.publicRead ? user.userId : `${dto.refId}/${user.userId}`;
    if (!dto.key.startsWith(`${cfg.keyPrefix}/${ownerPath}/`)) {
      throw new ForbiddenException(`该上传 key 不属于当前用户或活动`);
    }
    if (!cfg.allowedRoles.includes(user.role as any)) {
      throw new ForbiddenException(
        `Role ${user.role} 不允许 ${dto.scope} (需要: ${cfg.allowedRoles.join(', ')})`,
      );
    }
    if (!cfg.publicRead) {
      await this.validateRefIdForSign(dto.scope, dto.refId!, user);
    }
    const meta = await this.storage.headObject(dto.key, cfg.publicRead);
    if (!meta) {
      throw new NotFoundException(`上传 object 不存在: ${dto.key} (前端可能未完成 PUT)`);
    }
    await this.validateCompletedObject(dto.scope, dto.key, meta);

    const publicUrl = cfg.publicRead ? `${this.storage.getPublicUrlBase()}/${dto.key}` : undefined;

    let writtenBack = false;
    if (dto.refId && cfg.publicRead) {
      const ok = await this.routeWriteback(dto.scope, dto.refId!, publicUrl!, user);
      if (!ok) {
        throw new NotFoundException(`${dto.scope} 目标 refId=${dto.refId} 不存在或无权修改`);
      }
      writtenBack = true;
    }


    const mimeType = meta.contentType!.split(';', 1)[0].trim().toLowerCase();
    return {
      ...(publicUrl ? { url: publicUrl, publicUrl } : {}),
      key: dto.key,
      name: dto.filename ?? dto.key.split('/').pop()!,
      size: meta.size,
      mimeType,
      writtenBack,
    };
  }

  /**
   * 预签名 URL 只能约束请求头，不能可靠地限制实际上传的字节数。
   * 因此以对象存储返回的元数据作为完成上传前的最终准入依据。
   */
  private async validateCompletedObject(
    scope: UploadScope,
    key: string,
    meta: { size: number; contentType?: string },
  ): Promise<void> {
    const cfg = UPLOAD_SCOPES[scope];
    const maxBytes = cfg.maxSizeMB * 1024 * 1024;
    const actualContentType = meta.contentType?.split(';', 1)[0].trim().toLowerCase();

    if (meta.size > 0 && meta.size <= maxBytes && actualContentType && cfg.allowedMime.includes(actualContentType)) {
      return;
    }

    // Invalid objects must not remain available through a public bucket after a
    // failed confirmation. Deletion is best-effort so the validation error is
    // still returned even if storage cleanup itself is temporarily unavailable.
    try {
      await this.storage.deleteObject(key, cfg.publicRead);
    } catch (error) {
      this.logger.error(`删除不合规上传对象失败: ${key}`, error instanceof Error ? error.stack : undefined);
    }

    if (meta.size <= 0) {
      throw new BadRequestException('上传文件为空');
    }
    if (meta.size > maxBytes) {
      throw new BadRequestException(`${scope} 实际文件 ${meta.size} 字节超过上限 ${cfg.maxSizeMB}MB`);
    }
    throw new BadRequestException(
      `${scope} 实际文件类型 ${meta.contentType ?? 'unknown'} 不被允许`,
    );
  }

  private entityForScope(scope: UploadScope): string {
    const map: Record<UploadScope, string> = {
      'lesson-video': 'Lesson',
      'resource': 'Resource',
      'course-thumbnail': 'Course',
      'degree-thumbnail': 'NanoDegree',
      'hackathon-banner': 'Hackathon',
      'hackathon-judge-avatar': 'Judge',
      'hackathon-sponsor-logo': 'Sponsor',
      'hackathon-application-file': 'HackathonRegistration',
      'submission-attachment': 'Submission',
      'submission-video': 'Submission',
      'user-avatar': 'User',
    };
    return map[scope];
  }

  /**
   * 把 publicUrl 写到目标 entity 的对应列.
   * 返回 boolean 表示是否成功 (entity 存在 + 权限 OK).
   */
  private async routeWriteback(
    scope: UploadScope,
    refId: string,
    publicUrl: string,
    user: { userId: string; role: string },
  ): Promise<boolean> {
    const isAdmin = user.role === 'admin';

    switch (scope) {
      case 'lesson-video': {
        if (!isAdmin) return false;
        const r = await this.prisma.lesson.update({
          where: { id: refId },
          data: { videoUrl: publicUrl },
        });
        return !!r;
      }
      case 'resource': {
        // refId 与 sign 阶段同款约定 = 父 lessonId, resource 行此刻还不存在,
        // URL 由前端 createResource 时随表单带上, 这里不做写库。
        if (!isAdmin) return false;
        return true;
      }
      case 'course-thumbnail': {
        if (!isAdmin) return false;
        const r = await this.prisma.course.update({
          where: { id: refId },
          data: { thumbnail: publicUrl },
        });
        return !!r;
      }
      case 'degree-thumbnail': {
        if (!isAdmin) return false;
        const r = await this.prisma.nanoDegree.update({
          where: { id: refId },
          data: { thumbnail: publicUrl },
        });
        return !!r;
      }
      case 'hackathon-banner': {
        if (!isAdmin) return false;
        const r = await this.prisma.hackathon.update({
          where: { id: refId },
          data: { bannerUrl: publicUrl },
        });
        return !!r;
      }
      case 'hackathon-judge-avatar': {
        if (!isAdmin) return false;
        const r = await this.prisma.judge.update({
          where: { id: refId },
          data: { avatarUrl: publicUrl },
        });
        return !!r;
      }
      case 'hackathon-sponsor-logo': {
        if (!isAdmin) return false;
        const r = await this.prisma.sponsor.update({
          where: { id: refId },
          data: { logoUrl: publicUrl },
        });
        return !!r;
      }
      case 'submission-video': {
        const owned = await this.findOwnedSubmission(refId, user);
        if (!owned) return false;
        const r = await this.prisma.submission.update({
          where: { id: refId },
          data: { videoUrl: publicUrl },
        });
        return !!r;
      }
      case 'user-avatar': {
        // user 改自己 / admin 改任何人
        if (!isAdmin && refId !== user.userId) return false;
        const r = await this.prisma.user.update({
          where: { id: refId },
          data: { avatarUrl: publicUrl },
        });
        return !!r;
      }
      default:
        return false;
    }
  }

  async getRegistrationAttachmentUrl(
    user: { userId: string; role: string },
    registration: any,
    fieldId: string,
  ): Promise<string> {
    if (user.role !== 'admin' && registration.userId !== user.userId) {
      throw new ForbiddenException('无权读取该报名附件');
    }
    const attachment = registration.answers?.[fieldId];
    if (!attachment || typeof attachment.key !== 'string') {
      throw new NotFoundException('报名附件不存在');
    }
    return this.signPrivateAttachment(
      'hackathon-application-file',
      registration.hackathonId,
      [registration.userId, attachment.uploadedBy].filter(
        (id: unknown): id is string => typeof id === 'string',
      ),
      attachment.key,
    );
  }

  async getSubmissionAttachmentUrl(
    user: { userId: string; role: string },
    submission: any,
    index: number,
  ): Promise<string> {
    const attachment = Array.isArray(submission.attachments) && Number.isInteger(index)
      ? submission.attachments[index]
      : undefined;
    if (!attachment || typeof attachment.key !== 'string') {
      throw new NotFoundException('作品附件不存在');
    }
    const members = Array.isArray(submission.team?.members)
      ? submission.team.members
      : submission.teamId
        ? await this.prisma.teamMember.findMany({
            where: { teamId: submission.teamId },
            select: { userId: true },
          })
        : [];
    // uploadedBy 兜底: 上传者退出队伍后, 队友仍能下载其上传的附件。
    const ownerIds = [
      submission.userId,
      attachment.uploadedBy,
      ...members.map((member: any) => member.userId),
    ].filter((id: unknown): id is string => typeof id === 'string');
    if (user.role !== 'admin' && !ownerIds.includes(user.userId)) {
      throw new ForbiddenException('无权读取该作品附件');
    }
    return this.signPrivateAttachment(
      'submission-attachment',
      submission.hackathonId,
      ownerIds,
      attachment.key,
    );
  }

  /**
   * 报名/作品写入时校验客户端提交的附件元数据与对象存储中的真实对象一致,
   * 防止"真实传 1KB png 却谎称 10MB pdf"。返回盖章后的元数据 (uploadedBy)。
   */
  async verifyPrivateAttachment(
    scope: 'hackathon-application-file' | 'submission-attachment',
    hackathonId: string,
    uploaderId: string,
    meta: { key: string; name: string; size: number; mimeType: string },
  ): Promise<{ key: string; name: string; size: number; mimeType: string; uploadedBy: string }> {
    const cfg = UPLOAD_SCOPES[scope];
    if (!meta.key.startsWith(`${cfg.keyPrefix}/${hackathonId}/${uploaderId}/`)) {
      throw new BadRequestException('附件 key 与活动或上传者不匹配');
    }
    const object = await this.storage.headObject(meta.key, false);
    if (!object) {
      throw new BadRequestException('附件对象不存在或未完成上传');
    }
    if (object.size !== meta.size) {
      throw new BadRequestException('附件大小与已上传文件不一致');
    }
    const actualMime = object.contentType?.split(';', 1)[0].trim().toLowerCase();
    if (actualMime !== meta.mimeType.toLowerCase()) {
      throw new BadRequestException('附件类型与已上传文件不一致');
    }
    return { ...meta, uploadedBy: uploaderId };
  }

  private signPrivateAttachment(
    scope: 'hackathon-application-file' | 'submission-attachment',
    hackathonId: unknown,
    ownerIds: string[],
    key: string,
  ): Promise<string> {
    const cfg = UPLOAD_SCOPES[scope];
    if (
      typeof hackathonId !== 'string' ||
      !ownerIds.some((ownerId) => key.startsWith(`${cfg.keyPrefix}/${hackathonId}/${ownerId}/`))
    ) {
      throw new ForbiddenException('附件 key 与活动或所有者不匹配');
    }
    return this.storage.presignDownload(key, 5 * 60);
  }

  private findOwnedSubmission(
    submissionId: string,
    user: { userId: string; role: string },
  ) {
    return this.prisma.submission.findFirst({
      where: {
        id: submissionId,
        deletedAt: null,
        ...(user.role === 'admin'
          ? {}
          : {
              OR: [
                { userId: user.userId },
                { team: { members: { some: { userId: user.userId } } } },
              ],
            }),
      },
      select: { id: true },
    });
  }
}
