import { Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService, AUTH_PROVIDERS } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthProvider } from './providers/auth-provider.types';
import { EmailPasswordProvider } from './providers/email-password.provider';
import { OAuthProvider } from './providers/oauth.provider';
import { loadAuthConfig } from './config/auth.config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

// Security: refuse to boot with a weak or placeholder JWT secret.
function assertStrongJwtSecret(secret: string | undefined): string {
  const value = secret?.trim();
  if (!value) {
    throw new Error('JWT_SECRET is required');
  }
  if (value.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  const PLACEHOLDERS = [
    'change-this',
    'changeme',
    'placeholder',
    'your-secret',
    'example',
    'test-secret',
  ];
  const lower = value.toLowerCase();
  if (PLACEHOLDERS.some((p) => lower.includes(p))) {
    throw new Error('JWT_SECRET looks like a placeholder. Generate one with `openssl rand -hex 32`.');
  }
  return value;
}

/**
 * AuthModule
 *
 * Frank 的硬要求：可插拔 + 配置驱动 + 不 hardcode
 * - 启动时读 env,按 AUTH_PROVIDERS 列表动态构造 provider 实例
 * - 新增 provider：写 class + 在 providers 工厂加一行 + .env 启用
 * - 没启用的 provider 不会注入,不会出现在 listProviders
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = assertStrongJwtSecret(configService.get<string>('JWT_SECRET'));
        new Logger('AuthModule').log('JWT secret validated');
        return {
          secret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_ACCESS_EXPIRATION') ?? '15m') as `${number}m`,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PasswordResetService,
    PrismaService,
    {
      // 动态 provider 工厂：按 AUTH_PROVIDERS env 列表构造具体实例
      provide: AUTH_PROVIDERS,
      useFactory: (prisma: PrismaService) => {
        const config = loadAuthConfig();
        const logger = new Logger('AuthProviders');

        const built: AuthProvider[] = [];

        for (const id of config.enabledProviders) {
          const cfg = config.providers[id];

          if (id === 'email_password') {
            built.push(
              new EmailPasswordProvider(
                prisma,
                (cfg.bcryptRounds as number) ?? 12,
              ),
            );
            continue;
          }

          if (id.startsWith('oauth.')) {
            built.push(
              new OAuthProvider(
                id,
                {
                  clientId: cfg.clientId as string,
                  clientSecret: cfg.clientSecret as string,
                  redirectUri: cfg.redirectUri as string,
                  scopes: (cfg.scopes as string[]) ?? [],
                },
                prisma,
              ),
            );
            continue;
          }

          logger.warn(`No factory branch for provider "${id}", skipping`);
        }

        logger.log(`Loaded ${built.length} auth provider(s): ${built.map((p) => p.id).join(', ')}`);
        return built;
      },
      inject: [PrismaService],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
