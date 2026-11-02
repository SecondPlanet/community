import { create } from 'zustand';
import { setAccessToken } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  // 与 backend prisma UserRole enum 严格对齐(admin/student/instructor)
  // 注: 之前含 'super_admin' 字段,但 prisma schema 没这个 enum 值, 是 dead code.
  // 2026-07-23 安全加固时统一删除。如以后真要加 super_admin 角色, 同步
  // 改 prisma schema + backend + 这里。
  role: 'admin' | 'student' | 'instructor';
  avatarUrl?: string | null;
  passwordResetRequired?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  setAuth: (user: AuthUser, accessToken: string) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  clearAuth: () => void;
}

// P0 2026-07-24 修复: 去掉 zustand persist middleware
//
// 原因:
//   - persist 'auth-user' 到 localStorage 之前的行为是 "hard reload 后保留 user,
//     避免 AuthProvider 重新跑 refresh 流程"
//   - 但 zustand persist 的 hydration 时机 + React 19 strict mode 双 mount + vite
//     HMR 多次 reload 一起,会导致 user role 出现 race (登 admin 写 store, 但
//     localStorage 'auth-user' 还残留旧 student, 下次 hydrate 又被覆盖)
//   - Frank 实际症状: 登 admin 后 store.user 看着是 admin (Header 显示
//     "SecondPlanet Admin"), 但 ProtectedRoute 拿到 user.role !== 'admin' 跳 /
//
// 修法: 全部内存, 不持久化 user。hard reload 后由 AuthProvider boot 调
// POST /auth/refresh (走 httpOnly refresh_token cookie) 拿新 accessToken + user,
// setAuth 写 store, 体验跟之前一致。
//
// 安全收益: 与 "never localStorage" 哲学一致 (comment 原本就写, 但 persist 矛盾)。
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setAuth: (user, accessToken) => {
    setAccessToken(accessToken);
    set({ user });
  },
  updateUser: (patch) => set((state) => ({
    user: state.user ? { ...state.user, ...patch } : null,
  })),
  clearAuth: () => {
    setAccessToken(null);
    set({ user: null });
  },
}));
