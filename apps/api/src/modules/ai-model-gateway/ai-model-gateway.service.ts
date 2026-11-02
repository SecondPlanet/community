import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { UserAiProviderConfigService } from '../ai/user-ai-provider-config.service';
import { AiByokQuotaService, estimateAiTokens } from './ai-byok-quota.service';
import {
  AI_MODEL_TRANSPORT,
  AiModelTransport,
  AiProviderCredentials,
} from './ai-model-transport';

const convertZodSchema = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  options: { $refStrategy: 'none' },
) => unknown;

/** 社区版只有 BYOK 一条路径: 平台不托管 key, 用户自带 provider 配置。 */
export type AiProviderSource = 'byok';

export interface GenerateStructuredInput<TSchema extends z.ZodTypeAny> {
  userId: string;
  projectId?: string;
  jobId?: string;
  feature: string;
  prompt: string;
  schema: TSchema;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GenerateStructuredResult<T> {
  data: T;
  provider: string;
  model: string;
  providerSource: AiProviderSource;
  tokensIn: number;
  tokensOut: number;
  repaired: boolean;
}

@Injectable()
export class AiModelGatewayService {
  constructor(
    private readonly config: ConfigService,
    private readonly userProviders: UserAiProviderConfigService,
    private readonly quota: AiByokQuotaService,
    @Inject(AI_MODEL_TRANSPORT) private readonly transport: AiModelTransport,
  ) {}

  async generateStructured<TSchema extends z.ZodTypeAny>(
    input: GenerateStructuredInput<TSchema>,
  ): Promise<GenerateStructuredResult<z.infer<TSchema>>> {
    const credentials = await this.selectCredentials(input.userId);

    const outputContract = this.outputContract(input.schema);
    const structuredPrompt = [
      input.prompt,
      'Output contract: return exactly one JSON object matching this JSON Schema.',
      'Do not add markdown fences, commentary, or fields not permitted by the schema.',
      outputContract,
    ].join('\n\n');
    await this.quota.reserve(
      input.userId,
      estimateAiTokens(structuredPrompt, input.maxOutputTokens ?? 2500),
    );
    const first = await this.invoke(credentials, input, structuredPrompt);
    const parsed = this.parseStructured(input.schema, first.text);
    if (parsed.success) {
      return {
        data: parsed.data,
        provider: credentials.provider,
        model: credentials.model,
        providerSource: 'byok',
        tokensIn: first.tokensIn,
        tokensOut: first.tokensOut,
        repaired: false,
      };
    }

    const repairPrompt = [
      'Return only one JSON object that satisfies the requested schema.',
      'Do not add markdown fences or commentary.',
      `JSON Schema: ${outputContract}`,
      `Validation errors: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ').slice(0, 1500)}`,
      `Invalid output: ${first.text.slice(0, 12_000)}`,
    ].join('\n\n');
    const repaired = await this.invoke(credentials, input, repairPrompt);
    const repairedParsed = this.parseStructured(input.schema, repaired.text);
    if (!repairedParsed.success) {
      throw new BadGatewayException('AI_STRUCTURED_OUTPUT_INVALID');
    }
    return {
      data: repairedParsed.data,
      provider: credentials.provider,
      model: credentials.model,
      providerSource: 'byok',
      tokensIn: first.tokensIn + repaired.tokensIn,
      tokensOut: first.tokensOut + repaired.tokensOut,
      repaired: true,
    };
  }

  async verifyUserProvider(userId: string, provider: string) {
    const credentials = await this.userProviders.getUserForVerification(userId, provider);
    if (!credentials) throw new ServiceUnavailableException('AI_USER_PROVIDER_NOT_FOUND');
    try {
      const result = await this.transport.generate({
        credentials,
        prompt: 'Reply with the single word: ok',
        maxOutputTokens: 16,
        temperature: 0,
        timeoutMs: this.providerTimeoutMs,
      });
      const config = await this.userProviders.recordUserVerification(userId, provider);
      return { ok: true, sample: result.text.slice(0, 50), config };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI_USER_PROVIDER_VERIFY_FAILED';
      await this.userProviders.recordUserVerification(userId, provider, message);
      return { ok: false, error: message };
    }
  }

  /** BYOK-only: 用户必须先保存并验证自己的 provider 配置。 */
  private async selectCredentials(userId: string): Promise<AiProviderCredentials> {
    const userConfig = await this.userProviders.getUserActive(userId);
    if (!userConfig || (!userConfig.apiKey && userConfig.provider !== 'ollama')) {
      throw new ServiceUnavailableException('AI_PROVIDER_NOT_CONFIGURED');
    }
    return userConfig;
  }

  private async invoke<TSchema extends z.ZodTypeAny>(
    credentials: AiProviderCredentials,
    input: GenerateStructuredInput<TSchema>,
    prompt: string,
  ) {
    return this.transport.generate({
      credentials,
      prompt,
      maxOutputTokens: input.maxOutputTokens ?? 2500,
      temperature: input.temperature ?? 0.3,
      timeoutMs: this.providerTimeoutMs,
      structuredOutput: true,
    });
  }

  private parseStructured<TSchema extends z.ZodTypeAny>(schema: TSchema, text: string) {
    const normalized = text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    try {
      return schema.safeParse(JSON.parse(normalized));
    } catch {
      return schema.safeParse(undefined);
    }
  }

  private outputContract(schema: z.ZodTypeAny) {
    return JSON.stringify(convertZodSchema(schema, { $refStrategy: 'none' }));
  }

  private get providerTimeoutMs() {
    return this.config.get<number>('AI_PROVIDER_TIMEOUT_MS') ?? 60_000;
  }
}
