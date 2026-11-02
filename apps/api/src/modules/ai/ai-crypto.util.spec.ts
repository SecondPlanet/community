import { ConfigService } from '@nestjs/config';
import { AiKeyCrypto } from './ai-crypto.util';

function config(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('AiKeyCrypto production readiness', () => {
  it('fails startup when the production encryption key is missing', () => {
    expect(() => new AiKeyCrypto(config({ NODE_ENV: 'production' }))).toThrow(
      'AI_KEY_ENCRYPTION_KEY env 未配置',
    );
  });

  it('fails startup when the production encryption key is malformed', () => {
    expect(() => new AiKeyCrypto(config({
      NODE_ENV: 'production',
      AI_KEY_ENCRYPTION_KEY: 'not-hex-but-long-enough',
    }))).toThrow('AI_KEY_ENCRYPTION_KEY 必须是 64 字符 hex 字符串');
  });

  it('encrypts and decrypts with a valid production key', () => {
    const crypto = new AiKeyCrypto(config({
      NODE_ENV: 'production',
      AI_KEY_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
    }));
    const encrypted = crypto.encrypt('gemini-secret');

    expect(encrypted).not.toContain('gemini-secret');
    expect(crypto.decrypt(encrypted)).toBe('gemini-secret');
    expect(crypto.checkReady()).toBeNull();
  });

  it('keeps fail-closed degraded behavior outside production', () => {
    const crypto = new AiKeyCrypto(config({ NODE_ENV: 'test' }));

    expect(crypto.checkReady()).toBe('AI_KEY_ENCRYPTION_KEY env 未配置');
    expect(() => crypto.encrypt('secret')).toThrow('AI_KEY_ENCRYPTION_KEY env 未配置');
    expect(crypto.decrypt('enc:v1:invalid')).toBeNull();
  });
});
