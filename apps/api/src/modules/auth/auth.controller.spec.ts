import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    refresh: jest.fn(),
  };
  const passwordResetService = {};
  const controller = new AuthController(authService as never, passwordResetService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats a missing refresh cookie as a normal anonymous session', async () => {
    const response = { cookie: jest.fn() };

    await expect(
      controller.refresh({ cookies: {} } as never, response as never),
    ).resolves.toEqual({ accessToken: null, user: null });
    expect(authService.refresh).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('refreshes and rotates a supplied session cookie', async () => {
    authService.refresh.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'next-refresh-token',
      user: { id: 'user-1' },
    });
    const response = { cookie: jest.fn() };

    await expect(
      controller.refresh(
        { cookies: { refresh_token: 'current-refresh-token' } } as never,
        response as never,
      ),
    ).resolves.toEqual({ accessToken: 'access-token', user: { id: 'user-1' } });
    expect(authService.refresh).toHaveBeenCalledWith('current-refresh-token');
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'next-refresh-token',
      expect.objectContaining({ httpOnly: true, path: '/api/v1/auth' }),
    );
  });
});
