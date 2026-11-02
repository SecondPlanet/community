/**
 * cms-config.validator.ts — JSON value 校验 (CMS admin 写入)
 *
 * P0 2026-07-23 安全加固: AdminSettingsPage 之前 `JSON.parse` 在前端, 后端
 * controller 接收 unknown 后 `as never` cast 入库, 没任何 schema 校验。
 * 攻击场景: 恶意 admin (或被 compromise 的 admin 凭证) 写入巨大 / 极深 /
 * 不可序列化的 JSON 触发 DoS, 或者写入循环引用导致 Prisma 序列化失败
 * 返 500 + stack trace 泄露。
 *
 * 限制:
 *   - 序列化大小 ≤ 64 KB (Prisma MySQL JSON 列默认 65 KB 上限)
 *   - 嵌套深度 ≤ 10 层 (防 stack overflow)
 *   - 只允许 Prisma JSON 合法类型 (object / array / string / number / boolean / null)
 *   - 拒绝 undefined / function / symbol / Date (Date 会被 Prisma 转 ISO, 但
 *     admin UI 期望纯 JSON, 主动拒绝避免歧义)
 */
import { BadRequestException } from '@nestjs/common';

export const MAX_JSON_SIZE_BYTES = 64 * 1024;
export const MAX_JSON_DEPTH = 10;

export function validateJsonValue(value: unknown, depth = 0, path = '$'): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new BadRequestException(`JSON nested too deep at ${path} (max ${MAX_JSON_DEPTH})`);
  }
  if (value === null) return;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return;
  if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new BadRequestException(`JSON value at ${path} has unsupported type: ${t}`);
  }
  if (value instanceof Date) {
    throw new BadRequestException(`JSON value at ${path} is a Date; serialize to ISO string first`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => validateJsonValue(v, depth + 1, `${path}[${i}]`));
    return;
  }
  if (t === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      validateJsonValue(v, depth + 1, `${path}.${k}`);
    }
    return;
  }
  throw new BadRequestException(`JSON value at ${path} has unsupported type: ${t}`);
}

export function assertJsonSize(value: unknown): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (err) {
    throw new BadRequestException(
      `JSON value is not serializable: ${(err as Error).message}`,
    );
  }
  if (serialized === undefined) {
    throw new BadRequestException('JSON value serialized to undefined');
  }
  const size = Buffer.byteLength(serialized, 'utf8');
  if (size > MAX_JSON_SIZE_BYTES) {
    throw new BadRequestException(
      `JSON value too large: ${size} bytes (max ${MAX_JSON_SIZE_BYTES})`,
    );
  }
}
