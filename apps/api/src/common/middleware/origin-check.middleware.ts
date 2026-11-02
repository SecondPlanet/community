/**
 * OriginCheckMiddleware — 防御 CSRF 第二层
 *
 * 检查 mutating request (POST/PATCH/DELETE/PUT) 的 Origin / Referer header,
 * 跟 CORS_ORIGIN env 配置的白名单对比, 不在白名单直接 403。
 *
 * 跟 sameSite=strict 配合:
 *   - sameSite=strict (生产) → 浏览器不送 cookie → 攻击者拿不到 refresh_token
 *   - Origin check (本中间件) → 即便攻击者绕过 cookie (e.g. XSS / 网络代理),
 *     后端也拒绝跨站 POST/PATCH/DELETE 请求 → CSRF 写操作失败
 *
 * GET / HEAD / OPTIONS 不强制, 因为只读且浏览器预检已处理 OPTIONS.
 *
 * P0 2026-07-23 安全加固.
 */
import { Injectable, NestMiddleware, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  private readonly allowedOrigins: Set<string>;

  constructor(configService: ConfigService) {
    const corsOrigin = configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
    this.allowedOrigins = new Set(
      corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
    );
  }

  use(req: any, res: any, next: () => void) {
    const method = (req.method ?? 'GET').toUpperCase();
    // 只检查 mutating 方法
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next();
    }

    const origin = (req.headers?.origin ?? req.headers?.Origin) as string | undefined;
    const referer = (req.headers?.referer ?? req.headers?.Referer) as string | undefined;

    // 优先用 Origin, 没有再退到 Referer (代理/旧浏览器可能只送 Referer)
    const sourceUrl = origin ?? referer;
    if (!sourceUrl) {
      // mutating 请求既无 Origin 也无 Referer — 直接拒绝
      // (合法同源请求两者至少有一个)
      throw new BadRequestException('Missing Origin/Referer header');
    }

    let parsedOrigin: string;
    try {
      parsedOrigin = new URL(sourceUrl).origin;
    } catch {
      throw new BadRequestException('Invalid Origin/Referer');
    }

    if (!this.allowedOrigins.has(parsedOrigin)) {
      // 拒绝 — 但不泄露白名单内容
      throw new ForbiddenException('Cross-origin request blocked');
    }

    next();
  }
}
