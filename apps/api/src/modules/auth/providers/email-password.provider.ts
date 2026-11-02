import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthProvider, AuthIdentity, AuthCredentials } from './auth-provider.types';

/**
 * EmailPasswordProvider
 *
 * 把之前 AuthService 里 126 行的 email/password 逻辑（register/login/refresh）拆出来
 * 重点：原封不动保留：
 *   - bcrypt 12 rounds（来自 Frank 安全加固 commit b05bad7）
 *   - SHA-256 哈希 refresh token，不存原文
 *   - CSPRNG randomBytes(32) 生成 refresh token
 *   - token rotation（refresh 时删旧发新）
 *
 * 这一层不负责 token 签发和 User 记录 upsert（交给 AuthService 调度）
 */
@Injectable()
export class EmailPasswordProvider extends AuthProvider {
  readonly id = 'email_password' as const;
  readonly type = 'email_password' as const;
  readonly enabled = true;
  private readonly logger = new Logger(EmailPasswordProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bcryptRounds: number,
  ) {
    super();
  }

  /**
   * verify 入口对应前端 login 表单
   * credentials: { email, password, mode: 'login' | 'register' }
   */
  async verify(credentials: AuthCredentials): Promise<AuthIdentity> {
    const { email, password, mode } = credentials as {
      email: string;
      password: string;
      mode: 'login' | 'register';
    };

    if (mode === 'register') {
      return this.handleRegister(email, password, credentials as { name: string });
    }
    return this.handleLogin(email, password);
  }

  private async handleRegister(
    email: string,
    password: string,
    extras: { name: string },
  ): Promise<AuthIdentity> {
    if (
      typeof email !== 'string' ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
      typeof extras.name !== 'string' ||
      !extras.name.trim() ||
      extras.name.length > 50
    ) {
      throw new BadRequestException('Valid email and name are required');
    }
    if (
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 128 ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/.test(password)
    ) {
      throw new BadRequestException(
        'Password must be 12-128 characters and include uppercase, lowercase, number and symbol',
      );
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: extras.name,
      },
      select: { id: true, email: true, name: true },
    });

    this.logger.log(`Registered new user ${user.id} (${user.email})`);

    return {
      providerUserId: user.email,
      profile: {
        email: user.email,
        name: user.name,
        emailVerified: true,
      },
    };
  }

  private async handleLogin(email: string, password: string): Promise<AuthIdentity> {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      providerUserId: user.email,
      profile: {
        email: user.email,
        name: user.name,
        emailVerified: true,
        avatarUrl: user.avatarUrl ?? undefined,
      },
    };
  }

  /**
   * link：把 email/password 绑到现有 user（用于"已用 google 登录，现在想加密码"）
   * 实现：把 passwordHash 写到 user 行（如果已存在 hash 则覆盖——这是产品决策，
   * 真实场景下可能要走"重置密码"流程，MVP 阶段先这样）
   */
  async link(userId: string, credentials: AuthCredentials): Promise<void> {
    const { password } = credentials as { password: string };
    if (
      !password ||
      password.length < 12 ||
      password.length > 128 ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/.test(password)
    ) {
      throw new ConflictException(
        'Password must be 12-128 characters and include uppercase, lowercase, number and symbol',
      );
    }
    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordResetRequired: false },
    });
  }

  describe() {
    return { id: this.id, label: 'Email + Password', type: this.type };
  }
}
