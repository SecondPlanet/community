import { ServiceUnavailableException } from '@nestjs/common';
import { assertSafeAiBaseUrl } from '../ai/user-ai-provider-config.service';
import { HttpAiModelTransport, AiModelTransportRequest } from './ai-model-transport';

jest.mock('../ai/user-ai-provider-config.service', () => ({
  assertSafeAiBaseUrl: jest.fn(async (_provider: string, url: string) => url.replace(/\/$/, '')),
}));

describe('HttpAiModelTransport', () => {
  const transport = new HttpAiModelTransport();
  const baseRequest: AiModelTransportRequest = {
    credentials: {
      provider: 'openai',
      apiKey: 'provider-key',
      model: 'model-1',
      baseUrl: 'https://ai.example.test/v1',
    },
    prompt: 'hello',
    maxOutputTokens: 100,
    temperature: 0.2,
    timeoutMs: 30_000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls MiniMax with the Anthropic messages protocol and parses usage', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'ok' }],
        usage: { input_tokens: 11, output_tokens: 2 },
      }),
    } as Response);

    await expect(transport.generate({
      ...baseRequest,
      credentials: {
        provider: 'minimax',
        apiKey: 'minimax-key',
        model: 'MiniMax-M3',
        baseUrl: 'https://api.minimaxi.com/anthropic/',
      },
    })).resolves.toEqual({
      text: 'ok', tokensIn: 11, tokensOut: 2, usageEstimated: false,
    });

    expect(assertSafeAiBaseUrl).toHaveBeenCalledWith(
      'minimax',
      'https://api.minimaxi.com/anthropic/',
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.minimaxi.com/anthropic/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'minimax-key',
          'anthropic-version': '2023-06-01',
        }),
        body: expect.stringContaining('"model":"MiniMax-M3"'),
      }),
    );
  });

  it('only asks OpenAI-compatible providers for JSON mode on structured requests', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'answer' } }] }),
    } as Response);

    await transport.generate(baseRequest);
    const textBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(textBody.response_format).toBeUndefined();

    await transport.generate({ ...baseRequest, structuredOutput: true });
    const structuredBody = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);
    expect(structuredBody.response_format).toEqual({ type: 'json_object' });
  });

  it('maps non-success responses without exposing provider response bodies', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);

    await expect(transport.generate(baseRequest)).rejects.toThrow('AI_PROVIDER_HTTP_429');
  });

  it('aborts slow providers at the configured timeout', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const pending = expect(transport.generate({
      ...baseRequest,
      timeoutMs: 25,
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(25);
    await pending;
  });
});

// ==================== v1.9-alpha.2 (C-02) streaming ====================

/**
 * 把字符串切成 Uint8Array chunks, 模拟任意 chunk 边界
 * (包括把单行 JSON 切成两半, 用来测 LineSplitStream 的 buffer 行为)。
 */
function makeReadableStream(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
}

async function collect(iter: AsyncIterable<{ text: string; done: boolean }>): Promise<{ text: string; done: boolean }[]> {
  const out: { text: string; done: boolean }[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

/**
 * 创建一个永不产出数据的 ReadableStream; 当外部 AbortController 触发时,
 * controller.error 让 read() 抛错。模拟真实 fetch 的 cancel-on-abort 行为。
 */
function makeHangingBody(abortCtrl: AbortController): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      abortCtrl.signal.addEventListener('abort', () => {
        controller.error(new DOMException('aborted', 'AbortError'));
      });
    },
  });
}

describe('HttpAiModelTransport.generateStream (C-02)', () => {
  const transport = new HttpAiModelTransport();
  const baseRequest: AiModelTransportRequest = {
    credentials: {
      provider: 'openai',
      apiKey: 'k',
      model: 'm',
      baseUrl: 'https://ai.example.test/v1',
    },
    prompt: 'hi',
    maxOutputTokens: 100,
    temperature: 0,
    timeoutMs: 30_000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('OpenAI-compatible: 切分跨 chunk 边界 + [DONE] 终止', async () => {
    const body = makeReadableStream([
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n', // "hel" 完整(3 } + 1 ])
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n', // 跨下一个 chunk 切到一半
      '\n', // 上一行的换行
      'data: [DONE]\n\n',
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    const chunks = await collect(transport.generateStream(baseRequest));

    expect(chunks).toEqual([
      { text: 'hel', done: false },
      { text: 'lo', done: false },
      { text: '', done: true }, // 显式收尾
    ]);
    // 请求体带 stream:true
    const init = jest.mocked(global.fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).stream).toBe(true);
  });

  it('Anthropic (claude/minimax): event/data 协议 + content_block_delta', async () => {
    const body = makeReadableStream([
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"你"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"好"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    const chunks = await collect(transport.generateStream({
      ...baseRequest,
      credentials: { provider: 'claude', apiKey: 'k', model: 'claude-opus', baseUrl: 'https://api.anthropic.com' },
    }));

    // content_block_delta 产出文本; message_stop 产出 done=true
    expect(chunks).toEqual([
      { text: '你', done: false },
      { text: '好', done: false },
      { text: '', done: true },
    ]);
  });

  it('Gemini: streamGenerateContent 路径 + SSE 文本提取', async () => {
    const body = makeReadableStream([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}\n\n',
    ]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    const chunks = await collect(transport.generateStream({
      ...baseRequest,
      credentials: { provider: 'gemini', apiKey: 'k', model: 'gemini-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    }));

    expect(chunks).toEqual([
      { text: 'Hi', done: false },
      { text: ' there', done: false },
      { text: '', done: true },
    ]);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(':streamGenerateContent?alt=sse&key=k');
    expect(url).not.toContain(':generateContent');
  });

  it('Ollama: NDJSON 每行一个对象 + done:true 终止', async () => {
    const body = makeReadableStream([
      '{"message":{"content":"foo"}}\n',
      '{"message":{"content":"bar"}}\n',
      '{"done":true,"total_duration":1234}\n',
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    const chunks = await collect(transport.generateStream({
      ...baseRequest,
      credentials: { provider: 'ollama', apiKey: null, model: 'llama3', baseUrl: 'http://localhost:11434' },
    }));

    expect(chunks).toEqual([
      { text: 'foo', done: false },
      { text: 'bar', done: false },
      { text: '', done: true },
    ]);
  });

  it('上游非 2xx → 抛 ServiceUnavailableException (code 不泄露 body)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429, body: null } as Response);

    await expect(collect(transport.generateStream(baseRequest))).rejects.toThrow('AI_PROVIDER_HTTP_429');
  });

  it('body=null → 抛 ServiceUnavailableException', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body: null } as Response);

    await expect(collect(transport.generateStream(baseRequest))).rejects.toThrow('AI_PROVIDER_EMPTY_RESPONSE');
  });

  it('空闲超时 → 抛 ServiceUnavailableException (AI_PROVIDER_TIMEOUT)', async () => {
    // 调低 idleTimeoutMs 到 50ms, 避免默认 15s 拖死测试。
    // body 永远不产出数据; 内部空闲超时触发后 abort fetch, body 随之抛错。
    const fakeAbort = new AbortController();
    const body = makeHangingBody(fakeAbort);
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      // 真实 fetch 在 abort 时会 cancel body。把 mock 也接上: init.signal 触发时把 body 也 abort。
      init?.signal?.addEventListener('abort', () => fakeAbort.abort());
      return { ok: true, body } as Response;
    });

    const promise = collect(transport.generateStream(baseRequest, { idleTimeoutMs: 50 }));
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('外部 signal abort → 抛 ServiceUnavailableException', async () => {
    const fakeAbort = new AbortController();
    const body = makeHangingBody(fakeAbort);
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      init?.signal?.addEventListener('abort', () => fakeAbort.abort());
      return { ok: true, body } as Response;
    });

    const ctrl = new AbortController();
    const promise = collect(
      transport.generateStream(baseRequest, { signal: ctrl.signal, idleTimeoutMs: 50 }),
    );
    // 让 fetch mock 先把 listener 挂好(它是 async, 即时 resolve 但调度成 microtask)。
    await Promise.resolve();
    await Promise.resolve();
    // 不等空闲超时, 立刻外部 abort
    ctrl.abort();
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('心跳/未知帧忽略, 不抛错不产出 chunk', async () => {
    const body = makeReadableStream([
      ': heartbeat\n\n',
      'data: not-json-frame\n\n',
      'data: {"choices":[{"delta":{}}]}\n\n', // delta.content 缺失
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    const chunks = await collect(transport.generateStream(baseRequest));

    expect(chunks).toEqual([
      { text: 'ok', done: false },
      { text: '', done: true },
    ]);
  });

  // ==================== v1.9-alpha.2 (batch-5a Claude acceptance) 验证 ====================

  // B1: 消费者中断(break) → reader.cancel() + abort → fetch init.signal 真被 abort
  it('消费者中断 → fetch 的 signal.aborted 变为 true (上游连接关闭)', async () => {
    // 用 holder 避免闭包赋值被 TS 窄化成 never/undefined
    const holder: { signal?: AbortSignal } = {};
    const cancelListener = jest.fn();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"x"}}]}\n\n'));
        // body 在被 cancel 时调用 cancelListener,模拟上游 ReadableStream 默认行为
      },
      cancel() {
        cancelListener();
        streamController.error(new DOMException('aborted', 'AbortError'));
      },
    });
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      holder.signal = init?.signal ?? undefined;
      return { ok: true, body } as Response;
    });

    // generator 是 async function*, 通过 for-await-of + break 触发中断。
    for await (const _chunk of transport.generateStream(baseRequest)) {
      // 拿到第一个 chunk 后立刻 break,模拟消费者中断
      break;
    }

    // fetch 收到的 signal 必须 abort,否则上游连接会继续耗流量。
    expect(holder.signal?.aborted).toBe(true);
    expect(cancelListener).toHaveBeenCalled();
  });

  // B2: request.timeoutMs 用作首字节超时 — 上游接了连接但不响应
  it('首字节超时 → 抛 ServiceUnavailableException (request.timeoutMs)', async () => {
    jest.useFakeTimers();
    // fetch 永远不 resolve,模拟"接了连接但不响应"
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const promise = collect(transport.generateStream({
      ...baseRequest,
      timeoutMs: 50, // 50ms 首字节超时
    }));

    // 先挂断言(注册 rejection handler), 再推进时钟, 避免 unhandled rejection。
    const assertion = expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(51);
    await assertion;
  });

  // S1: openai 流被截断(EOF 无 [DONE]) → 抛 ServiceUnavailableException
  it('OpenAI 流截断(EOF 无 [DONE]) → 抛 AI_PROVIDER_STREAM_TRUNCATED', async () => {
    const body = makeReadableStream([
      'data: {"choices":[{"delta":{"content":"一半"}}]}\n\n',
      // 流突然关闭,没有 [DONE]
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    await expect(collect(transport.generateStream(baseRequest))).rejects.toThrow('AI_PROVIDER_STREAM_TRUNCATED');
  });

  it('Anthropic 流截断(EOF 无 message_stop) → 抛 AI_PROVIDER_STREAM_TRUNCATED', async () => {
    const body = makeReadableStream([
      'event: content_block_delta\ndata: {"delta":{"text":"一半"}}\n\n',
      // 没有 message_stop
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    await expect(
      collect(transport.generateStream({
        ...baseRequest,
        credentials: { provider: 'claude', apiKey: 'k', model: 'claude', baseUrl: 'https://api.anthropic.com' },
      })),
    ).rejects.toThrow('AI_PROVIDER_STREAM_TRUNCATED');
  });

  it('Ollama 流截断(EOF 无 done:true) → 抛 AI_PROVIDER_STREAM_TRUNCATED', async () => {
    const body = makeReadableStream([
      '{"message":{"content":"一半"}}\n',
      // 没有 done:true
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    await expect(
      collect(transport.generateStream({
        ...baseRequest,
        credentials: { provider: 'ollama', apiKey: null, model: 'm', baseUrl: 'http://localhost:11434' },
      })),
    ).rejects.toThrow('AI_PROVIDER_STREAM_TRUNCATED');
  });

  it('Gemini 流截断 → 仍 yield done=true (无终止协议, 正常收尾)', async () => {
    const body = makeReadableStream([
      'data: {"candidates":[{"content":{"parts":[{"text":"一段"}]}}]}\n\n',
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    const chunks = await collect(transport.generateStream({
      ...baseRequest,
      credentials: { provider: 'gemini', apiKey: 'k', model: 'gemini-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    }));
    expect(chunks).toEqual([{ text: '一段', done: false }, { text: '', done: true }]);
  });

  // S2: JSON 跨 chunk 边界 — 上一个用例只跨换行, 这里切到 JSON 字符串中间
  it('OpenAI: JSON 字符串被切到两个 chunk 中间 (无 [DONE] 收尾)', async () => {
    // 单行 JSON 切成三块,最后只有换行, 没有 [DONE] — 走 S1 截断分支
    const body = makeReadableStream([
      'data: {"choices":[{"delta":{"content":"hello wor',
      'ld"}}]}',
      '\n',
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    // chunks 应包含 'hello world' 然后抛 STREAM_TRUNCATED
    const collected: { text: string; done: boolean }[] = [];
    let err: unknown;
    try {
      for await (const c of transport.generateStream(baseRequest)) collected.push(c);
    } catch (e) {
      err = e;
    }
    expect(collected).toEqual([{ text: 'hello world', done: false }]);
    expect((err as Error).message).toContain('AI_PROVIDER_STREAM_TRUNCATED');
  });

  it('OpenAI: JSON 跨 chunk + [DONE] 在第三个 chunk, 完整还原 + done', async () => {
    const body = makeReadableStream([
      'data: {"choices":[{"delta":{"content":"hello wor',
      'ld"}}]}',
      '\n\ndata: [DONE]\n\n',
    ]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, body } as Response);

    const chunks = await collect(transport.generateStream(baseRequest));

    expect(chunks).toEqual([
      { text: 'hello world', done: false },
      { text: '', done: true },
    ]);
  });
});
