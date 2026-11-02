import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IssueCertificateDto } from './certificates.dto';

/**
 * CertificatesService — P1-8 我的证书 + 证书页
 *
 *  5 public API:
 *    - findMyCertificates(userId, query)  -> 登录用户证书列表
 *    - findCertificateById(id)            -> 单条详情 (公开 / 验证用)
 *    - verifyCertificate(serial)          -> 公开 verify, 返 { valid, certificate?: ... }
 *    - issueCertificate(input)            -> 业务侧触发(course / degree / hackathon 完成)
 *    - revokeCertificate(id, userId)      -> 管理员撤销
 *
 *  serial number 格式: OCSG-{YEAR}-{TYPE}-{4位序号}
 *  - 序号是按 type + 年份的全局递增(用 max(seq) + 1, 同事务内串行化)
 *  - 全表 unique,失败抛 ConflictException
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 当前用户的证书列表,按 issuedAt DESC。
   * 过滤 revoked 不显示(默认)。可选 type 过滤。
   */
  async findMyCertificates(userId: string, type?: string) {
    const where: {
      userId: string;
      revokedAt: null;
      type?: 'course' | 'degree' | 'hackathon';
    } = { userId, revokedAt: null };
    if (type && type !== 'all') where.type = type as 'course' | 'degree' | 'hackathon';

    const items = await this.prisma.certificate.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
    });
    const hiddenCertificateRefs = await this.findPrivateCourseCertificateRefs(items);
    const visibleItems = items.filter(
      (certificate) => !hiddenCertificateRefs.has(`${certificate.type}:${certificate.refId}`),
    );

    // 加 holderName 给前端展示(避免前端再 join user)
    const userIds = Array.from(new Set(visibleItems.map((c) => c.userId)));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    return visibleItems.map((c) => ({
      ...c,
      holderName: userMap.get(c.userId)?.name ?? null,
    }));
  }

  /**
   * 公开查单条证书,任何人都能看(证书本身就是公开证明)。
   * 返回时附 holderName, **不返回 email** (防止凭证书 ID 查持有人邮箱)。
   */
  async findCertificateById(id: string) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException('Certificate not found');
    if (await this.isPrivateCourseCertificate(cert)) {
      throw new NotFoundException('Certificate not found');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: cert.userId },
      select: { id: true, name: true },
    });
    return {
      ...cert,
      holderName: user?.name ?? null,
      valid: cert.revokedAt === null,
    };
  }

  /**
   * 公开 verify 接口,通过 serial number 查证书。
   * 匿名可访问,用于证书验证页 /verify/:serial。
   * 返 { valid: true, certificate: {...} } 或 { valid: false, reason: 'revoked' | 'not_found' }
   */
  async verifyCertificate(serial: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { serialNumber: serial },
    });
    if (!cert) {
      return { valid: false as const, reason: 'not_found' as const };
    }
    if (await this.isPrivateCourseCertificate(cert)) {
      return { valid: false as const, reason: 'not_found' as const };
    }
    if (cert.revokedAt) {
      return {
        valid: false as const,
        reason: 'revoked' as const,
        certificate: { serialNumber: cert.serialNumber, revokedAt: cert.revokedAt },
      };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: cert.userId },
      select: { name: true },
    });
    return {
      valid: true as const,
      certificate: {
        id: cert.id,
        serialNumber: cert.serialNumber,
        title: cert.title,
        type: cert.type,
        description: cert.description,
        issuedAt: cert.issuedAt,
        completedAt: cert.completedAt,
        verifyUrl: cert.verifyUrl,
        imageUrl: cert.imageUrl,
        holderName: user?.name ?? 'Anonymous',
      },
    };
  }

  /**
   * 业务侧触发签发。course / degree 完成后、hackathon 评审后调用。
   * serial 格式: OCSG-{YEAR}-{TYPE_UPPER}-{0001..N} (按 type + year 顺序递增)
   *
   * 返回已签发的 certificate。若该 user + ref + type 已有有效证书,直接返回(幂等)。
   * 已撤销证书只保留审计含义，不得阻止用户在重新满足条件后获得新证书。
   */
  async issueCertificate(input: IssueCertificateDto) {
    if (input.type === 'course') {
      const course = await this.prisma.course.findUnique({
        where: { id: input.refId },
        select: { origin: true, visibility: true },
      });
      if (course?.origin === 'ai_personal' || course?.visibility !== 'public') {
        throw new BadRequestException('Private personal courses do not issue formal certificates');
      }
    }
    if (input.type === 'degree' && await this.degreeContainsPrivateCourse(input.refId)) {
      throw new BadRequestException('Degrees containing private courses do not issue certificates');
    }
    // 幂等: 同一 user + type + refId 不重复发
    const existing = await this.prisma.certificate.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        refId: input.refId,
        revokedAt: null,
      },
    });
    if (existing) return existing;

    // 签发本身自带重试: 并发完成时 generateSerialNumber 可能算出同号撞
    // serialNumber @unique (P2002), 这里自动重取流水号重试, 上层 (completeLesson)
    // 不需要也不应该感知。
    const MAX_ISSUE_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ISSUE_ATTEMPTS; attempt++) {
      try {
        const serialNumber = await this.generateSerialNumber(input.type);
        const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();

        const cert = await this.prisma.certificate.create({
          data: {
            userId: input.userId,
            type: input.type,
            refId: input.refId,
            title: input.title,
            description: input.description,
            serialNumber,
            completedAt,
            verifyUrl: `/verify/${serialNumber}`,
            metadata: input.metadata as object | undefined,
          },
        });


        return cert;
      } catch (e: any) {
        if (e?.code === 'P2002' && attempt < MAX_ISSUE_ATTEMPTS) continue;
        throw e;
      }
    }
    throw new ConflictException('证书流水号生成冲突, 请重试');
  }

  /**
   * 撤销证书(管理员)。设置 revokedAt, 公开 verify 仍能查到但 valid=false。
   */
  async revokeCertificate(id: string, adminUserId: string) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException('Certificate not found');
    if (cert.revokedAt) {
      throw new ConflictException('Certificate already revoked');
    }
    const updated = await this.prisma.certificate.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return updated;
  }

  /**
   * 按 type + year 生成下一个序列号。
   * 实现: 查 type 开头且本年的最大序号, +1 拼接。
   * 简单实现, 不强串行(并发时极少数情况会撞 unique, prisma 抛 P2002 让 caller 重试)。
   */
  private async generateSerialNumber(type: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OCSG-${year}-${type.toUpperCase()}-`;
    // 找同年同 type 的最大序号
    const last = await this.prisma.certificate.findFirst({
      where: { serialNumber: { startsWith: prefix } },
      orderBy: { serialNumber: 'desc' },
      select: { serialNumber: true },
    });
    let next = 1;
    if (last) {
      const lastSeq = parseInt(last.serialNumber.slice(prefix.length), 10);
      if (!isNaN(lastSeq)) next = lastSeq + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  private async isPrivateCourseCertificate(certificate: { type: string; refId: string }) {
    if (certificate.type === 'degree') {
      return this.degreeContainsPrivateCourse(certificate.refId);
    }
    if (certificate.type !== 'course') return false;
    const course = await this.prisma.course.findUnique({
      where: { id: certificate.refId },
      select: { origin: true, visibility: true },
    });
    return course?.origin === 'ai_personal' || course?.visibility !== 'public';
  }

  private async findPrivateCourseCertificateRefs(
    certificates: Array<{ type: string; refId: string }>,
  ) {
    const courseIds = [
      ...new Set(
        certificates.flatMap((certificate) =>
          certificate.type === 'course' ? [certificate.refId] : [],
        ),
      ),
    ];
    const degreeIds = [
      ...new Set(
        certificates.flatMap((certificate) =>
          certificate.type === 'degree' ? [certificate.refId] : [],
        ),
      ),
    ];
    const courses = await this.prisma.course.findMany({
      where: {
        id: { in: courseIds },
        OR: [{ origin: 'ai_personal' }, { visibility: { not: 'public' } }],
      },
      select: { id: true },
    });
    const unsafeDegreeLinks = degreeIds.length
      ? await this.prisma.degreeCourse.findMany({
          where: {
            degreeId: { in: degreeIds },
            course: {
              OR: [
                { origin: 'ai_personal' },
                { visibility: { not: 'public' } },
                { status: { not: 'published' } },
              ],
            },
          },
          select: { degreeId: true },
        })
      : [];
    return new Set([
      ...courses.map((course) => `course:${course.id}`),
      ...unsafeDegreeLinks.map((link) => `degree:${link.degreeId}`),
    ]);
  }

  private async degreeContainsPrivateCourse(degreeId: string) {
    return !!(await this.prisma.degreeCourse.findFirst({
      where: {
        degreeId,
        course: {
          OR: [
            { origin: 'ai_personal' },
            { visibility: { not: 'public' } },
            { status: { not: 'published' } },
          ],
        },
      },
      select: { degreeId: true },
    }));
  }
}
