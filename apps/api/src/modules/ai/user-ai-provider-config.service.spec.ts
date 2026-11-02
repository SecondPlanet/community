import { BadRequestException } from '@nestjs/common';
import { UserAiProviderConfigService, assertSafeAiBaseUrl } from './user-ai-provider-config.service';

describe('assertSafeAiBaseUrl', () => {
  it('rejects non-HTTPS cloud endpoints', async () => {
    await expect(assertSafeAiBaseUrl('openai', 'http://example.com/v1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects private addresses for cloud providers', async () => {
    await expect(assertSafeAiBaseUrl('openai-compatible', 'https://127.0.0.1/v1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertSafeAiBaseUrl('openai-compatible', 'https://169.254.169.254/latest')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows the explicitly supported local Ollama endpoint', async () => {
    await expect(assertSafeAiBaseUrl('ollama', 'http://localhost:11434')).resolves.toBe('http://localhost:11434');
  });
});

describe('UserAiProviderConfigService user provider configuration', () => {
  const row = {
    id: 'user-cfg-1',
    userId: 'user-1',
    provider: 'minimax',
    apiKeyEnc: 'encrypted-existing-key',
    model: 'MiniMax-M3',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    isActive: true,
    verifiedAt: null,
    lastVerifyError: null,
  };
  const prisma: any = {
    userAiProviderConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const crypto: any = {
    checkReady: jest.fn(() => null),
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn(() => 'plain-existing-key'),
  };
  let service: UserAiProviderConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserAiProviderConfigService(prisma, crypto);
  });

  it('preserves an existing key when editing a provider with a blank key', async () => {
    prisma.userAiProviderConfig.findUnique.mockResolvedValue({ apiKeyEnc: 'encrypted-existing-key' });
    prisma.userAiProviderConfig.upsert.mockResolvedValue(row);
    prisma.userAiProviderConfig.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockResolvedValue([{ count: 1 }, row]);

    await service.upsertForUser('user-1', {
      provider: 'minimax',
      model: 'MiniMax-M3',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      isActive: true,
    });

    expect(prisma.userAiProviderConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.not.objectContaining({ apiKeyEnc: expect.anything() }),
    }));
    expect(prisma.userAiProviderConfig.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', provider: { not: 'minimax' }, isActive: true },
      data: { isActive: false },
    });
  });

  it('requires a key for a new non-local provider', async () => {
    prisma.userAiProviderConfig.findUnique.mockResolvedValue(null);

    await expect(service.upsertForUser('user-1', {
      provider: 'minimax',
      model: 'MiniMax-M3',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      isActive: true,
    })).rejects.toThrow('API Key 至少需要 8 个字符');
    expect(prisma.userAiProviderConfig.upsert).not.toHaveBeenCalled();
  });
});
