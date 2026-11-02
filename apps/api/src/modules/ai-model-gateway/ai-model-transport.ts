import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { assertSafeAiBaseUrl } from '../ai/user-ai-provider-config.service';

export interface AiProviderCredentials {
  provider: string;
  apiKey: string | null;
  model: string;
  baseUrl: string | null;
}

export interface AiModelTransportRequest {
  credentials: AiProviderCredentials;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  structuredOutput?: boolean;
}

export interface AiModelTransportResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  usageEstimated: boolean;
}

/**
 * v1.9-alpha.2 (C-02): 单个流式 chunk。`done=true` 表示服务端已完成流。
 * `text` 可能为空字符串(只是结束信号或控制帧)。
 */
export interface AiModelStreamChunk {
  text: string;
  done: boolean;
}

export interface AiModelStreamOptions {
  // v1.9-alpha.2 (C-02): 客户端断开时(批 5b SSE endpoint req.close)调用 abort()。
  // 内部空闲超时 + 外部 signal 同时生效; 任一触发 fetch 即中止。
  signal?: AbortSignal;
  // v1.9-alpha.2 (C-02): 测试用, 调低空闲超时(默认 15s 跑测试太慢)。
  // 生产路径走默认; 除非显式传更短值。
  idleTimeoutMs?: number;
}

export interface AiModelTransport {
  generate(request: AiModelTransportRequest): Promise<AiModelTransportResponse>;
  /**
   * v1.9-alpha.2 (C-02): 流式文本生成。
   * - 只产出 text 增量; 引用标记 [[src:...]] 等由上层 chat.service 处理
   *   (与 answer() 同步路径走同一套 extractSources, 详见 batch-5b)。
   * - 超时改"空闲超时": 收到每个 chunk 重置一次计时器, 避免长回答被
   *   总时长 timeout 截断。
   * - 异常抛 ServiceUnavailableException, 与 generate() 同语义。
   */
  generateStream(
    request: AiModelTransportRequest,
    opts?: AiModelStreamOptions,
  ): AsyncIterable<AiModelStreamChunk>;
}

export const AI_MODEL_TRANSPORT = Symbol('AI_MODEL_TRANSPORT');

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com',
  minimax: 'https://api.minimaxi.com/anthropic',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://localhost:11434',
};

// v1.9-alpha.2 (C-02): 默认空闲超时 — 收到上一个 chunk 之后多少毫秒没新数据
// 就视为上游僵死。首字节(响应头)超时由 request.timeoutMs 单独覆盖,
// 空闲超时只管流中段。测试可通过 opts.idleTimeoutMs 调低。
const DEFAULT_IDLE_TIMEOUT_MS = 15_000;

@Injectable()
export class HttpAiModelTransport implements AiModelTransport {
  async generate(request: AiModelTransportRequest): Promise<AiModelTransportResponse> {
    const { credentials } = request;
    const configuredBaseUrl = credentials.baseUrl || DEFAULT_BASE_URLS[credentials.provider];
    if (!configuredBaseUrl) {
      throw new ServiceUnavailableException('AI Base URL 未配置');
    }
    if (credentials.provider !== 'ollama' && !credentials.apiKey) {
      throw new ServiceUnavailableException('AI API Key 无效');
    }

    const baseUrl = await assertSafeAiBaseUrl(credentials.provider, configuredBaseUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const wireRequest = this.buildRequest(baseUrl, request);
      const response = await fetch(wireRequest.url, {
        method: 'POST',
        headers: wireRequest.headers,
        body: JSON.stringify(wireRequest.body),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `AI_PROVIDER_HTTP_${response.status}`,
        );
      }
      const payload = await response.json() as Record<string, any>;
      const parsed = this.parseResponse(credentials.provider, payload);
      if (!parsed.text.trim()) {
        throw new ServiceUnavailableException('AI_PROVIDER_EMPTY_RESPONSE');
      }
      return parsed;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException('AI_PROVIDER_TIMEOUT');
      }
      throw new InternalServerErrorException('AI_PROVIDER_REQUEST_FAILED');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *generateStream(
    request: AiModelTransportRequest,
    opts?: AiModelStreamOptions,
  ): AsyncIterable<AiModelStreamChunk> {
    const { credentials } = request;
    const configuredBaseUrl = credentials.baseUrl || DEFAULT_BASE_URLS[credentials.provider];
    if (!configuredBaseUrl) {
      throw new ServiceUnavailableException('AI Base URL 未配置');
    }
    if (credentials.provider !== 'ollama' && !credentials.apiKey) {
      throw new ServiceUnavailableException('AI API Key 无效');
    }

    const baseUrl = await assertSafeAiBaseUrl(credentials.provider, configuredBaseUrl);
    // 内部空闲超时 controller + 外部 signal 合并: 任一触发即中止 fetch。
    const internalController = new AbortController();
    const externalSignal = opts?.signal;
    const onExternalAbort = () => internalController.abort();
    if (externalSignal) {
      if (externalSignal.aborted) internalController.abort();
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let firstByteTimer: ReturnType<typeof setTimeout> | null = null;
    const armIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      const ms = opts?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
      idleTimer = setTimeout(() => internalController.abort(), ms);
    };
    // v1.9-alpha.2 (batch-5a Claude acceptance B2): 用 request.timeoutMs 作首字节超时,
    // 覆盖"上游接了连接但不响应"场景。响应到达后切换到空闲超时。
    const armFirstByteTimer = () => {
      if (firstByteTimer) clearTimeout(firstByteTimer);
      firstByteTimer = setTimeout(() => internalController.abort(), request.timeoutMs);
    };
    const clearFirstByteTimer = () => {
      if (firstByteTimer) {
        clearTimeout(firstByteTimer);
        firstByteTimer = null;
      }
    };

    try {
      const streamRequest = this.buildStreamRequest(baseUrl, request);
      armFirstByteTimer();
      const response = await fetch(streamRequest.url, {
        method: 'POST',
        headers: streamRequest.headers,
        body: JSON.stringify(streamRequest.body),
        signal: internalController.signal,
        redirect: 'error',
      });
      clearFirstByteTimer();
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `AI_PROVIDER_HTTP_${response.status}`,
        );
      }
      if (!response.body) {
        throw new ServiceUnavailableException('AI_PROVIDER_EMPTY_RESPONSE');
      }
      // TextDecoderStream 把 Uint8Array → string; LineSplitStream 按 \n 切。
      // 标准 Web Streams API, Node 18+ 原生支持, 0 依赖。
      const lineStream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new LineSplitStream());
      const reader = lineStream.getReader();
      armIdleTimer();
      const provider = credentials.provider;
      // v1.9-alpha.2 (C-02): done 信号由 parser 产出(provider 自带的终止协议:
      // openai `[DONE]` / anthropic `message_stop` / ollama `done:true`)。
      // Gemini 流没有终止协议, reader done → 补 done=true。
      // v1.9-alpha.2 (batch-5a Claude acceptance S1): openai/anthropic/ollama
      // 连接被切断(EOF 无终止帧)→ 抛错而非当成正常结束, 防止 5b 误把截断的
      // 回答当完整答案存库。
      let seenDone = false;
      try {
        const sseState: SseParseState = { eventName: null };
        while (true) {
          const { value: line, done } = await reader.read();
          if (done) break;
          armIdleTimer(); // 每读一行重置空闲计时
          for (const chunk of this.parseStreamLine(provider, line, sseState)) {
            if (chunk.done) seenDone = true;
            yield chunk;
          }
        }
      } finally {
        // v1.9-alpha.2 (batch-5a Claude acceptance B1): 消费者中断(break/return/
        // 上层抛错)时, 主动取消 reader + 中止 fetch, 否则上游连接会继续耗流量。
        // reader.cancel() 会让上游 ReadableStream 触发 cancel, fetch 收到 cancel
        // 信号后立即关闭 TCP 连接。
        try {
          await reader.cancel();
        } catch {
          // 已在终止中, 忽略
        }
        reader.releaseLock();
      }
      // gemini 收尾; 其他 provider 缺终止帧 → 视为上游截断(网络断开/服务端 bug),
      // 抛 SERVICE_UNAVAILABLE 让上层走错误分支而不是当成正常完成。
      if (!seenDone) {
        if (provider === 'gemini') {
          yield { text: '', done: true };
        } else {
          throw new ServiceUnavailableException('AI_PROVIDER_STREAM_TRUNCATED');
        }
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      // 上游 abort / 空闲超时 / 外部 signal: 都走 timeout 分支
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        // Node ReadableStream cancel-on-abort 时会包一层 AbortError
        (typeof error === 'object' && error !== null && (error as any).code === 'ABORT_ERR')
      ) {
        throw new ServiceUnavailableException('AI_PROVIDER_TIMEOUT');
      }
      throw new InternalServerErrorException('AI_PROVIDER_REQUEST_FAILED');
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      if (firstByteTimer) clearTimeout(firstByteTimer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      // v1.9-alpha.2 (batch-5a Claude acceptance m1): 统一在外层 finally abort,
      // 覆盖所有退出路径 — 包括非 2xx / body=null 提前 throw 时残留的 response 连接。
      // abort 幂等, 正常 EOF 后调用无副作用。
      internalController.abort();
    }
  }

  /**
   * v1.9-alpha.2 (C-02): 流式请求构造。只与 generate() 差异:
   * - openai/anthropic/ollama: body `stream: true`
   * - gemini: 路径换成 :streamGenerateContent?alt=sse
   */
  private buildStreamRequest(
    baseUrl: string,
    request: AiModelTransportRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    const { credentials, prompt, temperature, maxOutputTokens } = request;
    if (this.isAnthropicProvider(credentials.provider)) {
      return {
        url: `${baseUrl}/v1/messages`,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': credentials.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: {
          model: credentials.model,
          max_tokens: maxOutputTokens,
          temperature,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        },
      };
    }
    if (credentials.provider === 'gemini') {
      return {
        url: `${baseUrl}/models/${encodeURIComponent(credentials.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(credentials.apiKey ?? '')}`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        },
      };
    }
    if (credentials.provider === 'ollama') {
      return {
        url: `${baseUrl}/api/chat`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          model: credentials.model,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
          options: { temperature, num_predict: maxOutputTokens },
        },
      };
    }
    return {
      url: `${baseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      body: {
        model: credentials.model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxOutputTokens,
        stream: true,
      },
    };
  }

  /**
   * v1.9-alpha.2 (C-02): 单行 → 0 或多个 AiModelStreamChunk。
   * 返回多个 chunk 的场景(主要 anthropic): 同一行里多个 data: 帧并列,
   * 实际各 provider 实现里极少; 但代码保持对称以便将来测试。
   */
  private parseStreamLine(
    provider: string,
    line: string,
    sseState: SseParseState,
  ): AiModelStreamChunk[] {
    if (this.isAnthropicProvider(provider)) {
      return this.parseAnthropicStreamLine(line, sseState);
    }
    if (provider === 'gemini') {
      return this.parseGeminiStreamLine(line);
    }
    if (provider === 'ollama') {
      return this.parseOllamaStreamLine(line);
    }
    return this.parseOpenaiStreamLine(line);
  }

  /** OpenAI-compatible: `data: {...}` 或 `data: [DONE]` */
  private parseOpenaiStreamLine(line: string): AiModelStreamChunk[] {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return [];
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return [{ text: '', done: true }];
    try {
      const obj = JSON.parse(payload);
      const delta = obj?.choices?.[0]?.delta?.content;
      return typeof delta === 'string' && delta.length > 0 ? [{ text: delta, done: false }] : [];
    } catch {
      return []; // 心跳/未知帧忽略
    }
  }

  /** Anthropic: `event: <name>` 与 `data: {...}` 跨行配对 */
  private parseAnthropicStreamLine(line: string, state: SseParseState): AiModelStreamChunk[] {
    if (!line) return [];
    if (line.startsWith('event:')) {
      state.eventName = line.slice(6).trim();
      return [];
    }
    if (!line.startsWith('data:')) return [];
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return [{ text: '', done: true }];
    if (state.eventName === 'message_stop') return [{ text: '', done: true }];
    try {
      const obj = JSON.parse(payload);
      if (state.eventName === 'content_block_delta') {
        const text = obj?.delta?.text;
        return typeof text === 'string' && text.length > 0 ? [{ text, done: false }] : [];
      }
      return [];
    } catch {
      return [];
    }
  }

  /** Gemini: `data: {...}` (无 [DONE] 终止, 用 reader done 收尾) */
  private parseGeminiStreamLine(line: string): AiModelStreamChunk[] {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return [];
    const payload = trimmed.slice(5).trim();
    try {
      const obj = JSON.parse(payload);
      const parts = obj?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) return [];
      const text = parts.map((p: any) => p?.text ?? '').join('');
      return text.length > 0 ? [{ text, done: false }] : [];
    } catch {
      return [];
    }
  }

  /** Ollama: NDJSON, 每行一个 JSON 对象, `done: true` 终止 */
  private parseOllamaStreamLine(line: string): AiModelStreamChunk[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      const obj = JSON.parse(trimmed);
      if (obj?.done === true) return [{ text: '', done: true }];
      const text = obj?.message?.content;
      return typeof text === 'string' && text.length > 0 ? [{ text, done: false }] : [];
    } catch {
      return [];
    }
  }

  private buildRequest(
    baseUrl: string,
    request: AiModelTransportRequest,
  ): { url: string; headers: Record<string, string>; body: unknown } {
    const { credentials, prompt, temperature, maxOutputTokens } = request;
    if (this.isAnthropicProvider(credentials.provider)) {
      return {
        url: `${baseUrl}/v1/messages`,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': credentials.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: {
          model: credentials.model,
          max_tokens: maxOutputTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }],
        },
      };
    }
    if (credentials.provider === 'gemini') {
      return {
        url: `${baseUrl}/models/${encodeURIComponent(credentials.model)}:generateContent?key=${encodeURIComponent(credentials.apiKey ?? '')}`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        },
      };
    }
    if (credentials.provider === 'ollama') {
      return {
        url: `${baseUrl}/api/chat`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          model: credentials.model,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
          options: { temperature, num_predict: maxOutputTokens },
        },
      };
    }
    return {
      url: `${baseUrl}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      body: {
        model: credentials.model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxOutputTokens,
        ...(request.structuredOutput
          ? { response_format: { type: 'json_object' } }
          : {}),
      },
    };
  }

  private parseResponse(provider: string, payload: Record<string, any>): AiModelTransportResponse {
    let text = '';
    let tokensIn = 0;
    let tokensOut = 0;
    if (this.isAnthropicProvider(provider)) {
      text = payload?.content?.map((part: any) => part?.text ?? '').join('') ?? '';
      tokensIn = Number(payload?.usage?.input_tokens ?? 0);
      tokensOut = Number(payload?.usage?.output_tokens ?? 0);
    } else if (provider === 'gemini') {
      text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? '').join('') ?? '';
      tokensIn = Number(payload?.usageMetadata?.promptTokenCount ?? 0);
      tokensOut = Number(payload?.usageMetadata?.candidatesTokenCount ?? 0);
    } else if (provider === 'ollama') {
      text = payload?.message?.content ?? '';
      tokensIn = Number(payload?.prompt_eval_count ?? 0);
      tokensOut = Number(payload?.eval_count ?? 0);
    } else {
      const content = payload?.choices?.[0]?.message?.content;
      text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.map((part: any) => part?.text ?? '').join('')
          : '';
      tokensIn = Number(payload?.usage?.prompt_tokens ?? 0);
      tokensOut = Number(payload?.usage?.completion_tokens ?? 0);
    }
    return {
      text,
      tokensIn,
      tokensOut,
      usageEstimated: tokensIn === 0 && tokensOut === 0,
    };
  }

  private isAnthropicProvider(provider: string) {
    return provider === 'claude' || provider === 'minimax';
  }
}

// ============ v1.9-alpha.2 (C-02) 流式基础设施 ============

interface SseParseState {
  eventName: string | null;
}

/**
 * 把任意 chunk 切成 \n 分隔的行。处理两种边角:
 * - 跨 chunk 边界("\n" 在两个 chunk 之间): 用 buffer 暂存未完整行
 * - 末尾的 \r(某些代理用 \r\n): 自动剥掉
 * 不引入新依赖, 纯 Web Streams。
 */
class LineSplitStream extends TransformStream<string, string> {
  constructor() {
    let buffer = '';
    super({
      transform(chunk, controller) {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).replace(/\r$/, '');
          buffer = buffer.slice(idx + 1);
          controller.enqueue(line);
        }
      },
      flush(controller) {
        if (buffer.length > 0) {
          controller.enqueue(buffer.replace(/\r$/, ''));
          buffer = '';
        }
      },
    });
  }
}
