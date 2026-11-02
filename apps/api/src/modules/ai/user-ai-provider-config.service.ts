import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiKeyCrypto } from './ai-crypto.util';
import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';

/**
 * 用户自带 AI Provider 配置 (BYOK)。
 *
 * 社区版只有这一条路径: 平台不托管任何模型 key, 用户在
 * `UserAiProviderConfig` 里存自己的 key, 费用直接算在用户自己的
 * provider 账户上。
 */

export interface UpdateUserAiProviderDto {
  provider: string;
  apiKey?: string;
  model: string;
  baseUrl?: string | null;
  isActive?: boolean;
}

export interface UserAiProviderConfigPublic {
  id: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  isActive: boolean;
  verifiedAt: string | null;
  lastVerifyError: string | null;
  apiKeyMasked: string;
}

export const USER_AI_PROVIDERS = ['gemini', 'openai', 'claude', 'minimax', 'openai-compatible', 'ollama'] as const;

function isPrivateIp(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.internal')) return true;
  const version = isIP(value);
  if (version === 4) {
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (version === 6) {
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') ||
      value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') ||
      (value.startsWith('::ffff:') && isPrivateIp(value.slice('::ffff:'.length)));
  }
  return false;
}

/** Validate user-controlled upstream URLs before the API server connects to them. */
export async function assertSafeAiBaseUrl(provider: string, rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Base URL 格式无效');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new BadRequestException('Base URL 只支持不带账号密码的 HTTP(S) 地址');
  }
  const localOllama = provider === 'ollama' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!localOllama && parsed.protocol !== 'https:') {
    throw new BadRequestException('云端 AI 服务的 Base URL 必须使用 HTTPS');
  }
  if (isPrivateIp(parsed.hostname) && !localOllama) {
    throw new BadRequestException('Base URL 不允许指向本机或内网地址');
  }
  if (!localOllama) {
    try {
      const addresses = await dns.lookup(parsed.hostname, { all: true });
      if (addresses.some(({ address }) => isPrivateIp(address))) {
        throw new BadRequestException('Base URL 不允许解析到本机或内网地址');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Base URL 主机无法解析');
    }
  }
  return parsed.toString().replace(/\/$/, '');
}

@Injectable()
export class UserAiProviderConfigService implements OnModuleInit {
  private readonly logger = new Logger(UserAiProviderConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: AiKeyCrypto,
  ) {}

  onModuleInit() {
    const err = this.crypto.checkReady();
    if (err) {
      // fail-closed: 用户保存的 provider key 必须使用服务端主密钥加密。
      this.logger.warn(`AI key 加密未就绪: ${err}. 保存 AI key 端点将 503.`);
    }
  }

  private mask(plain: string | null): string {
    if (!plain) return '';
    if (plain.length <= 4) return '****';
    return '****' + plain.slice(-4);
  }

  async listForUser(userId: string): Promise<UserAiProviderConfigPublic[]> {
    const rows = await this.prisma.userAiProviderConfig.findMany({
      where: { userId },
      orderBy: { provider: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model,
      baseUrl: row.baseUrl,
      isActive: row.isActive,
      verifiedAt: row.verifiedAt instanceof Date ? row.verifiedAt.toISOString() : row.verifiedAt ?? null,
      lastVerifyError: row.lastVerifyError ?? null,
      apiKeyMasked: this.mask(this.crypto.decrypt(row.apiKeyEnc)),
    }));
  }

  async upsertForUser(userId: string, dto: UpdateUserAiProviderDto): Promise<UserAiProviderConfigPublic> {
    if (!USER_AI_PROVIDERS.includes(dto.provider as (typeof USER_AI_PROVIDERS)[number])) {
      throw new BadRequestException(`不支持的 AI 接入方式: ${dto.provider}`);
    }
    const existing = await this.prisma.userAiProviderConfig.findUnique({
      where: { userId_provider: { userId, provider: dto.provider } },
      select: { apiKeyEnc: true },
    });
    const nextApiKey = dto.apiKey?.trim();
    if (dto.provider !== 'ollama' && !existing && (!nextApiKey || nextApiKey.length < 8)) {
      throw new BadRequestException('API Key 至少需要 8 个字符');
    }
    if (nextApiKey && nextApiKey.length < 8) {
      throw new BadRequestException('API Key 至少需要 8 个字符');
    }
    if (!dto.model?.trim()) throw new BadRequestException('模型名称不能为空');
    const baseUrl = dto.baseUrl?.trim() ? await assertSafeAiBaseUrl(dto.provider, dto.baseUrl.trim()) : null;
    const isActive = dto.isActive ?? true;
    const upsert = this.prisma.userAiProviderConfig.upsert({
      where: { userId_provider: { userId, provider: dto.provider } },
      create: {
        userId,
        provider: dto.provider,
        apiKeyEnc: this.crypto.encrypt(nextApiKey ?? ''),
        model: dto.model.trim(),
        baseUrl,
        isActive,
        verifiedAt: null,
        lastVerifyError: null,
      },
      update: {
        ...(nextApiKey ? { apiKeyEnc: this.crypto.encrypt(nextApiKey) } : {}),
        model: dto.model.trim(),
        baseUrl,
        isActive,
        verifiedAt: null,
        lastVerifyError: null,
      },
    });
    const row = isActive
      ? (await this.prisma.$transaction([
          this.prisma.userAiProviderConfig.updateMany({
            where: { userId, provider: { not: dto.provider }, isActive: true },
            data: { isActive: false },
          }),
          upsert,
        ]))[1]
      : await upsert;
    return {
      id: row.id,
      provider: row.provider,
      model: row.model,
      baseUrl: row.baseUrl,
      isActive: row.isActive,
      verifiedAt: row.verifiedAt instanceof Date ? row.verifiedAt.toISOString() : row.verifiedAt ?? null,
      lastVerifyError: row.lastVerifyError ?? null,
      apiKeyMasked: this.mask(this.crypto.decrypt(row.apiKeyEnc)),
    };
  }

  async removeForUser(userId: string, provider: string): Promise<void> {
    await this.prisma.userAiProviderConfig.deleteMany({ where: { userId, provider } });
  }

  async getUserActive(userId: string) {
    const row = await this.prisma.userAiProviderConfig.findFirst({
      where: { userId, isActive: true, verifiedAt: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) return null;
    return { provider: row.provider, apiKey: this.crypto.decrypt(row.apiKeyEnc), model: row.model, baseUrl: row.baseUrl };
  }

  async getUserForVerification(userId: string, provider: string) {
    const row = await this.prisma.userAiProviderConfig.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!row) return null;
    return {
      provider: row.provider,
      apiKey: this.crypto.decrypt(row.apiKeyEnc),
      model: row.model,
      baseUrl: row.baseUrl,
    };
  }

  async recordUserVerification(userId: string, provider: string, error?: string) {
    const row = await this.prisma.userAiProviderConfig.update({
      where: { userId_provider: { userId, provider } },
      data: error
        ? { verifiedAt: null, lastVerifyError: error.slice(0, 1000) }
        : { verifiedAt: new Date(), lastVerifyError: null },
    });
    return {
      id: row.id,
      provider: row.provider,
      model: row.model,
      baseUrl: row.baseUrl,
      isActive: row.isActive,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      lastVerifyError: row.lastVerifyError,
      apiKeyMasked: this.mask(this.crypto.decrypt(row.apiKeyEnc)),
    } satisfies UserAiProviderConfigPublic;
  }
}
