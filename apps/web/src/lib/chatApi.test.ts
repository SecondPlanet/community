/**
 * chatApi 测试
 *
 * 1. createSession context 参数 (v1.9-alpha.1 B-05)
 * 2. stripSourceMarkers — 流式渲染用 [[src:]] 剥离 (v1.9-alpha.2 batch-5b C-02)
 * 3. streamChatMessage — SSE 解析 / 401 刷新重试 / 错误透传 (batch-5b C-02)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatApi, streamChatMessage, stripSourceMarkers } from './chatApi';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  getAccessToken: vi.fn(() => 'tok-1'),
  refreshSession: vi.fn(),
}));

import api from './api';

const mockPost = vi.mocked(api.post);
const mockGet = vi.mocked(api.get);
const { getAccessToken: mockGetAccessToken, refreshSession: mockRefreshSession } = vi.mocked(
  await import('./api'),
) as unknown as {
  getAccessToken: ReturnType<typeof vi.fn>;
  refreshSession: ReturnType<typeof vi.fn>;
};

describe('chatApi.createSession (B-05)', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { sessionId: 's-1', title: null } } as never);
  });

  it('无参数 → 空 body (保持旧行为)', async () => {
    await chatApi.createSession();
    expect(mockPost).toHaveBeenCalledWith('/api/v1/chat/sessions', {});
  });

  it('只有 title → body 只带 title(前端不 trim,后端 trim)', async () => {
    await chatApi.createSession('  hello  ');
    expect(mockPost).toHaveBeenCalledWith('/api/v1/chat/sessions', { title: '  hello  ' });
  });

  it('带 lessonId + courseId → 两者都写入 body', async () => {
    await chatApi.createSession('课程 RAG', { lessonId: 'lesson-1', courseId: 'course-1' });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/chat/sessions', {
      title: '课程 RAG',
      lessonId: 'lesson-1',
      courseId: 'course-1',
    });
  });

  it('context 只有 lessonId → body 不带 courseId 字段', async () => {
    await chatApi.createSession(undefined, { lessonId: 'lesson-1' });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/chat/sessions', { lessonId: 'lesson-1' });
  });
});

// v1.9-alpha.2 (batch-5b C-02): [[src:]] 剥离 — 完整标记 + 未闭合尾巴
describe('stripSourceMarkers (batch-5b C-02)', () => {
  it('完整标记剥掉, 正文保留', () => {
    expect(stripSourceMarkers('答案 [[src:course:c-1:标题:/courses/c-1]] 结束')).toBe('答案  结束');
  });

  it('未闭合尾巴 (流刚收到半截标记) 从 [[src: 起截断', () => {
    expect(stripSourceMarkers('答案 [[src:course:c-1')).toBe('答案 ');
  });

  it('多个完整标记全剥', () => {
    expect(
      stripSourceMarkers('A [[src:course:c-1:t:/u]] B [[src:lesson:l-1:t2:/u2]] C'),
    ).toBe('A  B  C');
  });

  it('没有标记 → 原样返回', () => {
    expect(stripSourceMarkers('普通回答')).toBe('普通回答');
  });

  it('幂等: 剥完再剥不变', () => {
    const once = stripSourceMarkers('答 [[src:course:c-1:t:/u]] [[src:course:c-2');
    expect(stripSourceMarkers(once)).toBe(once);
  });
});

// v1.9-alpha.2 (batch-5b C-02): SSE 流式客户端
describe('streamChatMessage (batch-5b C-02)', () => {
  function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockGetAccessToken.mockReturnValue('tok-1');
    mockRefreshSession.mockReset();
  });

  it('SSE 解析: delta/done 事件分发 + Authorization header', async () => {
    const fetchMock = vi.stubGlobal('fetch', vi.fn()).mock;
    void fetchMock;
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      body: sseBody([
        'event: delta\ndata: {"event":"delta","text":"你好"}\n\n',
        'event: done\ndata: {"event":"done","userMsgId":"u1","assistantMsgId":"a1","content":"你好","sources":[],"partial":false}\n\n',
      ]),
    });

    const deltas: string[] = [];
    let done: unknown;
    await streamChatMessage(
      's-1',
      'q',
      { onDelta: (t) => deltas.push(t), onDone: (p) => (done = p) },
    );

    expect(deltas).toEqual(['你好']);
    expect(done).toMatchObject({ event: 'done', assistantMsgId: 'a1', partial: false });
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/api/v1/chat/sessions/s-1/messages/stream');
    expect(call[1].headers.Authorization).toBe('Bearer tok-1');
  });

  it('事件跨 chunk 切开 (SSE 帧分两段到达) 仍正确解析', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      body: sseBody([
        'event: delta\ndata: {"event":"del',
        'ta","text":"hi"}\n\nevent: done\ndata: {"event":"done","userMsgId":"u","assistantMsgId":"a","content":"hi","sources":[],"partial":false}\n\n',
      ]),
    });

    const deltas: string[] = [];
    await streamChatMessage('s-1', 'q', { onDelta: (t) => deltas.push(t) });
    expect(deltas).toEqual(['hi']);
  });

  it('401 → refreshSession 一次 → 重试成功', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, body: null })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: sseBody(['event: done\ndata: {"event":"done","userMsgId":"u","assistantMsgId":"a","content":"x","sources":[],"partial":false}\n\n']),
      });
    mockRefreshSession.mockResolvedValue({ accessToken: 'tok-2' });
    mockGetAccessToken.mockReturnValue('tok-2');

    await streamChatMessage('s-1', 'q', {});

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok-2');
  });

  it('非 ok (无 body) → throw, message 取后端 message 字段', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ message: '会话不存在' })),
    });

    await expect(streamChatMessage('s-bad', 'q', {})).rejects.toThrow('会话不存在');
  });
});

// v1.9-alpha.2 (batch-6 A-08): GET /chat/capabilities
describe('chatApi.getCapabilities (batch-6 A-08)', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('enabled=true: 返回 enabled shape', async () => {
    mockGet.mockResolvedValue({ data: { enabled: true } } as never);
    const cap = await chatApi.getCapabilities();
    expect(cap).toEqual({ enabled: true });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/chat/capabilities');
  });

  it('enabled=false + BUDGET_DISABLED: 返回 reason', async () => {
    mockGet.mockResolvedValue({
      data: { enabled: false, reason: 'BUDGET_DISABLED' },
    } as never);
    const cap = await chatApi.getCapabilities();
    expect(cap).toEqual({ enabled: false, reason: 'BUDGET_DISABLED' });
  });

  it('enabled=false + NOT_CONFIGURED: 返回 reason', async () => {
    mockGet.mockResolvedValue({
      data: { enabled: false, reason: 'NOT_CONFIGURED' },
    } as never);
    const cap = await chatApi.getCapabilities();
    expect(cap).toEqual({ enabled: false, reason: 'NOT_CONFIGURED' });
  });
});
