import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  isEnabled() {
    return Boolean(
      this.config.get<string>('RESEND_API_KEY')?.trim() &&
      this.config.get<string>('MAIL_FROM')?.trim() &&
      this.config.get<string>('PUBLIC_URL')?.trim(),
    );
  }

  capability() {
    return { enabled: this.isEnabled() };
  }

  async request(emailInput: string) {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('自助邮件重置尚未配置，请联系平台管理员');
    }

    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, passwordHash: true },
    });

    // Keep the response identical for unknown, disabled and OAuth-only users.
    if (!user?.passwordHash) return { accepted: true };

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const record = await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
      select: { id: true },
    });

    try {
      await this.sendEmail(user.email, token, record.id);
    } catch (error) {
      await this.prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
      this.logger.error('Password reset email delivery failed', error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException('重置邮件暂时无法发送，请稍后重试');
    }

    return { accepted: true };
  }

  async confirm(token: string, newPassword: string) {
    const now = new Date();
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt <= now || record.user.deletedAt) {
      throw new UnauthorizedException('重置链接无效或已过期');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('重置链接无效或已过期');
      }
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordResetRequired: false },
      });
      await tx.refreshToken.deleteMany({ where: { userId: record.userId } });
      await tx.passwordResetToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      });
    });

    return { changed: true };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sendEmail(to: string, token: string, idempotencyKey: string) {
    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY').trim();
    const from = this.config.getOrThrow<string>('MAIL_FROM').trim();
    const publicUrl = this.config.getOrThrow<string>('PUBLIC_URL').replace(/\/$/, '');
    const resetUrl = `${publicUrl}/auth/reset?token=${encodeURIComponent(token)}`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `password-reset-${idempotencyKey}`,
        'User-Agent': 'SecondPlanet/1.0',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: '重置你的 SecondPlanet 密码',
        text: `请在 30 分钟内打开以下链接重置密码：\n\n${resetUrl}\n\n如果不是你发起的请求，请忽略本邮件。`,
        html: `<p>请在 30 分钟内点击下方链接重置密码：</p><p><a href="${resetUrl}">重置密码</a></p><p>如果不是你发起的请求，请忽略本邮件。</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Resend API returned ${response.status}`);
    }
  }
}
