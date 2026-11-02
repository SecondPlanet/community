import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore.updateUser', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('updates the current user without replacing the rest of the session profile', () => {
    useAuthStore.getState().setAuth({
      id: 'user-1',
      email: 'student@example.com',
      name: '原姓名',
      role: 'student',
    }, 'access-token');

    useAuthStore.getState().updateUser({ name: '新姓名' });

    expect(useAuthStore.getState().user).toEqual({
      id: 'user-1',
      email: 'student@example.com',
      name: '新姓名',
      role: 'student',
    });
  });

  it('is a no-op when there is no authenticated user', () => {
    useAuthStore.getState().updateUser({ name: '不会写入' });
    expect(useAuthStore.getState().user).toBeNull();
  });
});
