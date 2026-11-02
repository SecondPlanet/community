/**
 * api.ts — Axios 单例 + access token 持久化
 *
 * 设计目标(按 Frank 偏好"零硬编码 + 可换 token 策略"):
 *   1. **同源**: 默认 baseURL 用 window.location.origin,通过 Vite proxy(/api/*
 *      → http://localhost:8080)转发。生产 nginx 同理。开发/生产都是同源,
 *      httpOnly cookie(sameSite=lax + path=/api/v1/auth)能正常收发。
 *   2. **access token 持久化**:
 *      - 旧实现: module-level `let accessToken`,hard reload 后丢失 → 401。
 *      - 新实现: memory 缓存 + sessionStorage 兜底。
 *        - sessionStorage 选型原因: 同 tab hard reload 留存 / 关闭 tab 自动清
 *          / 跨 tab 隔离(比 localStorage 强)。
 *        - 仍是 httpOnly refresh token 的 fallback 策略:access 过期 →
 *          axios interceptor → POST /auth/refresh → cookie 带 → 拿新 access。
 *   3. **可换 token 策略**: 后续要换 sessionStorage / cookie / IndexedDB,
 *      只动 setAccessToken / getAccessToken 两个函数。
 *   4. **XSS 缓解(有限)**: 不放 localStorage,所以跨 tab / 跨会话不会泄漏。
 *      同 tab 内 XSS 仍能读 sessionStorage —— 这是已知 trade-off,比 hard
 *      reload 401 强。
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const ACCESS_TOKEN_KEY = 'aicourse.accessToken';

/**
 * 安全读 sessionStorage,捕获 privacy mode / SSR 异常。
 * 返回 string | null,绝不抛。
 */
function readToken(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    /* privacy mode / disabled — 退化为纯内存 */
  }
}

// 内存缓存 — 同步读取用(axios request interceptor 不能 await)
let accessToken: string | null = readToken();

// Development must stay on the Vite origin so refresh cookies work through the
// `/api` proxy even when the page is opened as 127.0.0.1 instead of localhost.
// Production may opt into a separate API origin explicitly.
const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = import.meta.env.DEV ? '' : configuredApiBase ?? '';

export function setAccessToken(token: string | null) {
  accessToken = token;
  writeToken(token);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export const api = axios.create({
  // 默认同源 — Vite dev server(5500)把 /api/* proxy 到后端 8080。
  baseURL: apiBaseUrl,
  timeout: 10000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * 401 → refresh → retry 一次
 *
 * - 关键: refresh 端点用裸 axios 调(不走 api),避免递归触发本 interceptor
 * - withCredentials 必须 true,否则 httpOnly cookie 不发
 * - refresh 失败不递归 — 直接跳 /auth/login(避免 infinite loop)
 */
type RefreshPayload = { accessToken?: string | null; user?: unknown } | null;

let refreshingPromise: Promise<RefreshPayload> | null = null;

async function doRefresh(): Promise<RefreshPayload> {
  try {
    const baseURL = apiBaseUrl || window.location.origin;
    const { data } = await axios.post(
      `${baseURL}/api/v1/auth/refresh`,
      {},
      { withCredentials: true },
    );
    setAccessToken(data.accessToken);
    return data;
  } catch {
    setAccessToken(null);
    return null;
  }
}

/**
 * 全站共享的静默刷新。AuthProvider boot 与 401 拦截器必须都走这里：
 * refresh token 是一次性轮换的，两处各自发 POST /auth/refresh 会并发
 * 复用同一个旧 cookie，互相挤掉登录态（表现为偶发被踢回 /auth/login）。
 */
export function refreshSession(): Promise<RefreshPayload> {
  if (!refreshingPromise) {
    refreshingPromise = doRefresh().finally(() => {
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    if (!original) return Promise.reject(err);

    // 不要在 refresh 请求本身失败时递归 / 跳 login
    const isRefreshCall = original.url?.includes('/auth/refresh');
    if (err.response?.status !== 401 || original._retry || isRefreshCall) {
      return Promise.reject(err);
    }

    original._retry = true;

    // 并发请求去重 — boot 与多个 401 共享同一个 in-flight refresh
    const data = await refreshSession();

    if (data?.accessToken) {
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    }

    // refresh 失败 — 已经在 auth 页就不跳了(避免 redirect loop)
    const onAuthPage = window.location.pathname.startsWith('/auth/');
    if (!onAuthPage) {
      // 带 BASE_URL 前缀 + 完整当前地址(含 query), 登录后能回到原页面
      const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
      window.location.href =
        `${base}/auth/login?from=` +
        encodeURIComponent(window.location.pathname + window.location.search);
    }
    return Promise.reject(err);
  },
);

export default api;
