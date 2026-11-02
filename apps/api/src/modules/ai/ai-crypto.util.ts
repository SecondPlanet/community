/**
 * ai-crypto.util — AES-256-GCM 加密 AI API key
 *
 * P0 修复(2026-07-24): admin 后台保存的 AI key 加密存储
 * - 加密格式: <iv-b64>.<tag-b64>.<ct-b64> (base64, 段分隔符 '.')
 * - 密钥来源: env `AI_KEY_ENCRYPTION_KEY` (32 字节 hex 字符串, 64 字符)
 * - fail-closed: 密钥缺失/格式错时 encrypt 抛错, decrypt 返回 null
 *
 * 设计理由:
 * - 不引入新库: Node.js 内置 crypto 模块足够
 * - 不硬编码密钥: 完全从 env 读, 跟 auth 走同一套 fail-closed 模式
 * - 不写自定义 IV: 每次 encrypt 用 crypto.randomBytes(12) 随机 IV
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

const IV_BYTES = 12; // GCM 标准
const ENC_PREFIX = 'enc:v1:'; // 格式版本, 留给将来 rotate

@Injectable()
export class AiKeyCrypto {
  private readonly keyBuf: Buffer | null;
  private readonly keyError: string | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('AI_KEY_ENCRYPTION_KEY')?.trim();
    if (!raw) {
      this.keyBuf = null;
      this.keyError = 'AI_KEY_ENCRYPTION_KEY env 未配置';
      if (config.get<string>('NODE_ENV') === 'production') {
        throw new Error(this.keyError);
      }
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      this.keyBuf = null;
      this.keyError = 'AI_KEY_ENCRYPTION_KEY 必须是 64 字符 hex 字符串 (32 字节)';
      if (config.get<string>('NODE_ENV') === 'production') {
        throw new Error(this.keyError);
      }
      return;
    }
    this.keyBuf = Buffer.from(raw, 'hex');
    this.keyError = null;
  }

  /** 启动时自检: 返回 null 表示 OK, 否则返回错误说明 */
  checkReady(): string | null {
    return this.keyError;
  }

  encrypt(plain: string): string {
    if (!this.keyBuf) {
      throw new Error(this.keyError ?? 'Encryption key not ready');
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.keyBuf, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ENC_PREFIX + [iv, tag, ct].map((b) => b.toString('base64')).join('.');
  }

  decrypt(payload: string): string | null {
    if (!this.keyBuf) return null;
    if (!payload.startsWith(ENC_PREFIX)) return null;
    const parts = payload.slice(ENC_PREFIX.length).split('.');
    if (parts.length !== 3) return null;
    try {
      const iv = Buffer.from(parts[0], 'base64');
      const tag = Buffer.from(parts[1], 'base64');
      const ct = Buffer.from(parts[2], 'base64');
      if (iv.length !== IV_BYTES || tag.length !== 16) return null;
      const decipher = createDecipheriv('aes-256-gcm', this.keyBuf, iv);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      return pt.toString('utf8');
    } catch {
      return null;
    }
  }
}
