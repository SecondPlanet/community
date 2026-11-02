import { z } from 'zod';
import { AiByokQuotaService } from './ai-byok-quota.service';
import { AiModelGatewayService } from './ai-model-gateway.service';

describe('AiModelGatewayService', () => {
  const config = {
    get: jest.fn().mockReturnValue(60_000),
  };
  const userProviders = {
    getUserActive: jest.fn(),
    getUserForVerification: jest.fn(),
    recordUserVerification: jest.fn(),
  };
  const transport = { generate: jest.fn(), generateStream: jest.fn() };
  const quota = { reserve: jest.fn().mockResolvedValue(undefined) };
  const service = new AiModelGatewayService(
    config as never,
    userProviders as never,
    quota as never,
    transport,
  );
  const schema = z.object({ title: z.string(), lessons: z.array(z.string()) });

  beforeEach(() => {
    jest.clearAllMocks();
    userProviders.getUserActive.mockResolvedValue({
      provider: 'openai', apiKey: 'user-key', model: 'test-model', baseUrl: 'https://api.example.test/v1',
    });
  });

  it('parses structured output using the user BYOK configuration', async () => {
    transport.generate.mockResolvedValue({
      text: '{"title":"Course","lessons":["One"]}',
      tokensIn: 100,
      tokensOut: 30,
      usageEstimated: false,
    });

    const result = await service.generateStructured({
      userId: 'user-1',
      projectId: 'project-1',
      jobId: 'job-1',
      feature: 'course_plan',
      prompt: 'make a plan',
      schema,
    });

    expect(result.data.title).toBe('Course');
    expect(result.providerSource).toBe('byok');
    expect(result.repaired).toBe(false);
    const firstPrompt = transport.generate.mock.calls[0][0].prompt as string;
    expect(firstPrompt).toContain('make a plan');
    expect(firstPrompt).toContain('Output contract:');
    expect(firstPrompt).toContain('"required":["title","lessons"]');
    expect(firstPrompt).toContain('"additionalProperties":false');
  });

  it('performs exactly one repair for invalid structured output', async () => {
    transport.generate
      .mockResolvedValueOnce({ text: 'not-json', tokensIn: 10, tokensOut: 5, usageEstimated: true })
      .mockResolvedValueOnce({
        text: '```json\n{"title":"Fixed","lessons":["One"]}\n```',
        tokensIn: 20,
        tokensOut: 10,
        usageEstimated: false,
      });

    const result = await service.generateStructured({
      userId: 'user-1',
      feature: 'course_plan',
      prompt: 'make a plan',
      schema,
    });

    expect(result.data.title).toBe('Fixed');
    expect(result.repaired).toBe(true);
    expect(transport.generate).toHaveBeenCalledTimes(2);
    expect(transport.generate.mock.calls[1][0].prompt).toContain('JSON Schema:');
    expect(transport.generate.mock.calls[1][0].prompt).toContain('"required":["title","lessons"]');
  });

  it('fails when the user has no verified BYOK configuration', async () => {
    userProviders.getUserActive.mockResolvedValue(null);

    await expect(service.generateStructured({
      userId: 'user-1', feature: 'course_plan', prompt: 'plan', schema,
    })).rejects.toMatchObject({ message: 'AI_PROVIDER_NOT_CONFIGURED' });
    expect(transport.generate).not.toHaveBeenCalled();
  });
});
