import { HttpException } from '@nestjs/common';
import { AiByokQuotaService, estimateAiTokens } from './ai-byok-quota.service';

describe('AiByokQuotaService', () => {
  const evalMock = jest.fn();
  const getMock = jest.fn();
  const redis = { getClient: () => ({ eval: evalMock, get: getMock }) } as never;
  const config = { get: jest.fn() } as never;
  let service: AiByokQuotaService;

  beforeEach(() => {
    jest.clearAllMocks();
    (config as any).get.mockImplementation((key: string) =>
      key === 'AI_USER_DAILY_BYOK_TOKENS' ? 1_000 : undefined,
    );
    evalMock.mockResolvedValue(1);
    getMock.mockResolvedValue('0');
    service = new AiByokQuotaService(redis, config);
  });

  it('reserves tokens inside the daily limit', async () => {
    await expect(service.reserve('u-1', 400)).resolves.toBeUndefined();
    expect(evalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.stringContaining('u-1'),
      1_000,
      400,
      expect.any(Number),
    );
  });

  it('throws 429 AI_BUDGET_EXCEEDED when the daily limit is spent', async () => {
    evalMock.mockResolvedValue(0);
    await expect(service.reserve('u-1', 400)).rejects.toBeInstanceOf(HttpException);
    await expect(service.reserve('u-1', 400)).rejects.toMatchObject({ status: 429 });
  });

  it('reports exhaustion for the capabilities probe', async () => {
    getMock.mockResolvedValue('1000');
    await expect(service.isExhausted('u-1')).resolves.toBe(true);
    getMock.mockResolvedValue('10');
    await expect(service.isExhausted('u-1')).resolves.toBe(false);
  });

  it('estimates the worst-case token count of one call', () => {
    expect(estimateAiTokens('abcd', 100)).toBe(101);
  });
});
