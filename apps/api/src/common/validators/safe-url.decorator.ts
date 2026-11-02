/**
 * @SafeUrl — 限制 URL scheme (防 javascript: / data: / file: XSS/SSRF)
 *
 * 2026-07-24: P0 安全修 (video upload + permissions)
 * 之前大量 url 字段用 @IsString, 可被存 javascript:data:text/html,<script>...
 *
 * 2026-08-05: 修 bug — 之前 protocols 参数被硬编码 https? 忽略
 * 现在 protocols 真正生效, 默认 ['http', 'https']
 *
 * 用法:  @SafeUrl() url: string                            // 默认 http/https
 *        @SafeUrl({ optional: true }) url?: string         // 可选
 *        @SafeUrl({ protocols: ['https'] }) url: string    // 只允许 https
 */
import { applyDecorators } from '@nestjs/common';
import { IsOptional, IsString, IsUrl, Matches, MaxLength, ValidateIf } from 'class-validator';

// 默认允许的 protocol 列表
const DEFAULT_PROTOCOLS = ['http', 'https'] as const;

// 协议字符串 → 正则
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSafeUrlRegex(protocols: readonly string[]): RegExp {
  // 防 (?i) bypass: protocols 已知是 lower-case, 强制转义
  const proto = protocols.map((p) => escapeForRegex(p.toLowerCase())).join('|');
  // ^proto1|proto2:\/\/... — case-insensitive 协议头
  return new RegExp(`^(?:${proto}):\\/\\/[^\\s/$.?#].[^\\s]*$`, 'i');
}

export function SafeUrl(options: { optional?: boolean; maxLength?: number; protocols?: readonly string[] } = {}) {
  const { optional = false, maxLength = 500, protocols = DEFAULT_PROTOCOLS } = options;
  const regex = buildSafeUrlRegex(protocols);
  const decorators: PropertyDecorator[] = [
    Matches(regex, {
      // class-validator 用 $property 插值字段名; 之前的 {property} 会原样泄漏给用户
      message: `$property 必须是合法的 ${protocols.join('/')} URL`,
    }),
  ];
  if (optional) {
    decorators.push(IsOptional());
    // 可选字段传空串("没有填这个 URL")应视为未提供, 而不是非法 URL。
    // IsOptional 只跳过 null/undefined, 这里补上空串语义。
    decorators.push(ValidateIf((_object, value) => value !== ''));
  } else {
    decorators.push(IsString());
  }
  if (maxLength) {
    decorators.push(MaxLength(maxLength));
  }
  return applyDecorators(...decorators);
}

// 显式 @IsUrl 带 protocols — 用于已有 class-validator 体系的地方
export function IsHttpUrl(options: { optional?: boolean; maxLength?: number; protocols?: readonly string[] } = {}) {
  const { optional = false, maxLength = 500, protocols = DEFAULT_PROTOCOLS } = options;
  return applyDecorators(
    optional ? IsOptional() : IsString(),
    MaxLength(maxLength),
    IsUrl({
      protocols: [...protocols],
      require_protocol: true,
      require_valid_protocol: true,
    }),
  );
}
