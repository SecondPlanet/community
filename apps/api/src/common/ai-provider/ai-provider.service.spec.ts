import { AiProviderService } from './ai-provider.service';

describe('AiProviderService', () => {
  const config = { get: jest.fn().mockReturnValue(45_000) };
  const transport = { generate: jest.fn(), generateStream: jest.fn() };
  let service: AiProviderService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(45_000);
    service = new AiProviderService(config as any, transport);
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses the shared transport with the caller-provided key and model', async () => {
    transport.generate.mockResolvedValue({
      text: 'answer', tokensIn: 2, tokensOut: 1, usageEstimated: false,
    });

    await expect(service.generateTextWithCredentials({
      provider: 'deepseek',
      apiKey: 'user-db-key',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
    }, 'hello', { maxOutputTokens: 42, temperature: 0.2 })).resolves.toBe('answer');
    expect(transport.generate).toHaveBeenCalledWith({
      credentials: expect.objectContaining({
        provider: 'deepseek', apiKey: 'user-db-key', model: 'deepseek-chat',
      }),
      prompt: 'hello',
      maxOutputTokens: 42,
      temperature: 0.2,
      timeoutMs: 45_000,
      structuredOutput: false,
    });
  });

  it('verifies MiniMax through the native Anthropic transport path', async () => {
    transport.generate.mockResolvedValue({
      text: 'ok', tokensIn: 8, tokensOut: 1, usageEstimated: false,
    });

    await expect(service.generateTextWithCredentials({
      provider: 'minimax',
      apiKey: 'minimax-key',
      model: 'MiniMax-M3',
      baseUrl: 'https://api.minimaxi.com/anthropic',
    }, 'Reply with the single word: ok', { maxOutputTokens: 16, temperature: 0 })).resolves.toBe('ok');
    expect(transport.generate).toHaveBeenCalledWith(expect.objectContaining({
      credentials: expect.objectContaining({
        provider: 'minimax',
        model: 'MiniMax-M3',
        baseUrl: 'https://api.minimaxi.com/anthropic',
      }),
    }));
  });
});
