import {
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_MODEL_TRANSPORT,
  AiModelStreamChunk,
  AiModelStreamOptions,
  AiModelTransport,
  AiProviderCredentials,
} from '../../modules/ai-model-gateway/ai-model-transport';

export interface GenerateTextOptions {
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * 文本生成客户端 (BYOK)。
 *
 * 社区版没有平台托管的 key, 调用方必须自带 `AiProviderCredentials`
 * (来自 `UserAiProviderConfig`)。传输层统一支持 Anthropic、Gemini、
 * Ollama 和 OpenAI-compatible 协议。
 */
@Injectable()
export class AiProviderService {
  constructor(
    private readonly config: ConfigService,
    @Inject(AI_MODEL_TRANSPORT) private readonly transport: AiModelTransport,
  ) {}

  async generateTextWithCredentials(
    credentials: AiProviderCredentials,
    prompt: string,
    opts?: GenerateTextOptions,
  ): Promise<string> {
    const result = await this.transport.generate({
      credentials,
      prompt,
      temperature: opts?.temperature ?? 0.7,
      maxOutputTokens: opts?.maxOutputTokens ?? 800,
      timeoutMs: this.config.get<number>('AI_PROVIDER_TIMEOUT_MS') ?? 60_000,
      structuredOutput: false,
    });
    return result.text;
  }

  /**
   * v1.9-alpha.2 (C-02): 流式版本, 用法与 generateTextWithCredentials 相同,
   * 产出 AsyncIterable<AiModelStreamChunk>。批 5b SSE endpoint 会消费。
   */
  generateTextStreamWithCredentials(
    credentials: AiProviderCredentials,
    prompt: string,
    opts?: GenerateTextOptions,
    streamOpts?: AiModelStreamOptions,
  ): AsyncIterable<AiModelStreamChunk> {
    return this.transport.generateStream(
      {
        credentials,
        prompt,
        temperature: opts?.temperature ?? 0.7,
        maxOutputTokens: opts?.maxOutputTokens ?? 800,
        timeoutMs: this.config.get<number>('AI_PROVIDER_TIMEOUT_MS') ?? 60_000,
        structuredOutput: false,
      },
      streamOpts,
    );
  }
}
