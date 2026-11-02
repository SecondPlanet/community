/**
 * persistence — 持久化策略统一 (v1.5.3)
 *
 * 三档策略, 写新 store / hook 时按下面标准选:
 *
 *   memory  仅本次会话内有效(默认). 用于: user / auth token / role
 *   session 跨 reload 留存, close tab 清, 跨 tab 隔离. 用于: 草稿 / 表单 / chat sessionId
 *   local   长期持久, 跨 tab 共享. 用于: theme / 语言偏好 / 用户显式收藏
 *
 * 选择标准:
 *   1. 是否敏感 (PII / token)        → 必须 memory
 *   2. 是否多账号共享冲突             → 用 session(避免账号 A 的 sessionId 污染账号 B)
 *   3. 是否是用户显式偏好             → 用 local(用户主动选择, 主动权在用户)
 *   4. 否则                          → memory
 *
 * 异常处理: 全部 try/catch 兜底, privacy mode / SSR / 浏览器禁用 storage 时
 * 安全降级到 memory 语义(返回 null / no-op, 不抛错)。
 */

export type PersistenceLevel = 'memory' | 'session' | 'local';

function safeGet(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage | null, key: string, value: string | null): void {
  if (!storage) return;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* quota exceeded / privacy mode / SSR — 安全降级到不持久化 */
  }
}

function pickStorage(level: PersistenceLevel): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    if (level === 'session') return window.sessionStorage;
    if (level === 'local') return window.localStorage;
    return null;
  } catch {
    return null;
  }
}

/**
 * 从指定 level 读 string. 失败/降级时返回 fallback.
 */
export function readPersisted(
  key: string,
  level: PersistenceLevel,
  fallback: string | null = null,
): string | null {
  const storage = pickStorage(level);
  const value = safeGet(storage, key);
  return value ?? fallback;
}

/**
 * 写 string 到指定 level. value === null 时清除. 失败/降级时静默 no-op.
 */
export function writePersisted(
  key: string,
  value: string | null,
  level: PersistenceLevel,
): void {
  const storage = pickStorage(level);
  safeSet(storage, key, value);
}

/**
 * 封装 store 的 session-level 持久化: 写时存 + 删除时清.
 * 用于 zustand store 的 partial persist pattern.
 */
export const sessionPersist = {
  read: (key: string) => readPersisted(key, 'session'),
  write: (key: string, value: string | null) => writePersisted(key, value, 'session'),
};

export const localPersist = {
  read: (key: string) => readPersisted(key, 'local'),
  write: (key: string, value: string | null) => writePersisted(key, value, 'local'),
};
