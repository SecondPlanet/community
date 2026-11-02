import { Controller, Post, Body, Req, Res, Get, Delete, HttpCode, HttpStatus, Param, BadRequestException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  LoginDto,
  OAuthCallbackDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RegisterDto,
} from './auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';

/**
 * AuthController - 重构后
 *
 * 端点分层：
 * - 旧端点（保留兼容）: /auth/register /auth/login /auth/refresh /auth/logout
 * - 新端点（抽象层）:    /auth/providers /auth/:providerId /auth/:providerId/callback
 *
 * 旧端点内部走 email_password provider（保留 Frank 安全加固 commit 的逻辑）
 * 新端点通用：传 providerId + credentials
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  // ============ 新端点：列出可用 provider ============

  /** 前端 LoginPage 用：列出可用的 provider 渲染按钮（OAuth / SSO 入口） */
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Get('providers')
  async listProviders() {
    return { providers: await this.authService.listProviders() };
  }

  @Get('password-reset/capability')
  passwordResetCapability() {
    return this.passwordResetService.capability();
  }

  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 5, ttl: 60000 } })
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.passwordResetService.request(dto.email);
  }

  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 10, ttl: 60000 } })
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.passwordResetService.confirm(dto.token, dto.newPassword);
  }

  @Get('identities')
  @UseGuards(JwtAuthGuard)
  async listIdentities(@Req() req: Request & { user: { userId: string } }) {
    return this.authService.listIdentities(req.user.userId);
  }

  @Delete('identities/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkIdentity(
    @Param('id') identityId: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    await this.authService.unlinkIdentity(req.user.userId, identityId);
  }

  @Get(':providerId/start')
  start(@Param('providerId') providerId: string) {
    return this.authService.createAuthorization(providerId);
  }

  @Get(':providerId/link/start')
  @UseGuards(JwtAuthGuard)
  startLink(
    @Param('providerId') providerId: string,
    @Req() req: Request & { user: { userId: string } },
  ) {
    return this.authService.createLinkAuthorization(req.user.userId, providerId);
  }

  @Post(':providerId/link/callback')
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  async linkCallback(
    @Param('providerId') providerId: string,
    @Body() dto: OAuthCallbackDto,
    @Req() req: Request & { user: { userId: string } },
  ) {
    return this.authService.linkIdentity(req.user.userId, providerId, { ...dto });
  }

  // ============ 旧端点：email/password 兼容 ============

  // P1-7: 显式 'short' + 'medium' 覆盖全局 5/sec 60/min, 对注册收紧到 5/min 挡批量账号
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // P1-7: 5/sec 30/min 挡密码爆破, 仍允许合法用户失败重试
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  // Security: refresh 走 httpOnly cookie,不在 body 取（防 log 泄露 + 防恶意扩展）
  //
  // P1 fix: 全局 throttler (5/sec, 60/min per IP) 对 refresh 太紧 — 每次 page
  // load 都会调一次 (AuthProvider boot + 401 fallback),hard reload 几下就
  // 429。refresh 是合法高频操作,放宽到 30/sec, 300/min — 仍能挡 brute force
  // (7-char token 暴力破解需要 1000+ QPS),不会拦正常用户。
  @Throttle({ short: { limit: 30, ttl: 1000 }, medium: { limit: 300, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.['refresh_token'];
    if (!token) {
      // Anonymous page loads probe the current session. Missing credentials are
      // a normal "signed out" state, not an authentication error. Invalid or
      // expired credentials still fail with 401 inside authService.refresh().
      return { accessToken: null, user: null };
    }
    const result = await this.authService.refresh(token);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  // P1-7: 5/sec 30/min 防止 token 暴力清除 race
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60000 } })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.cookies?.['refresh_token']);
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return { message: 'Logged out' };
  }

  // ============ 新端点：通用 provider 入口 ============

  /**
   * 通用 provider authenticate 入口
   * - email_password: body = { email, password, mode: 'login' | 'register' }
   * - oauth.google / oauth.github: body = { code }
   *
   * 返回结构跟 /auth/login 一致（access + refresh + user）
   */
  // P1-7: 通用 provider 入口 — 5/sec 30/min 跟 login 对齐 (OAuth callback 也是登录动作)
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60000 } })
  @Post(':providerId')
  @HttpCode(HttpStatus.OK)
  async authenticate(
    @Param('providerId') providerId: string,
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body || Object.keys(body).length === 0) {
      throw new BadRequestException('Missing credentials');
    }
    const result = await this.authService.authenticate(providerId, body);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post(':providerId/callback')
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async callback(
    @Param('providerId') providerId: string,
    @Body() dto: OAuthCallbackDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.authenticate(providerId, { ...dto });
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    // Security:
    //  - httpOnly: 防止 JS 读
    //  - secure: 生产强制 https
    //  - sameSite=strict (生产) / lax (开发): 防 CSRF
    //    - 生产: 严格防 CSRF (顶层导航 POST 都不带 cookie);用户从 email link
    //      跳回站点需重新登录,这是可接受 trade-off (登录有 cookie 限 7 天)
    //    - 开发: dev 跨端口 (5502→8080) 时 strict 会被一些浏览器当作跨站,
    //      实际不送 cookie. 改 'lax' 在 dev 体验与安全间取平衡.
    //  - path=/api/v1/auth: 限定 cookie 路径, admin 写操作 (PATCH/DELETE
    //    /api/v1/admin/*) 不走此 path, 也不依赖此 cookie, 攻击者拿不到
    //    accessToken 即没法发起有效 CSRF 写操作.
    // P0 2026-07-23 安全加固: 之前全环境都用 'lax', prod 改 'strict'.
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
