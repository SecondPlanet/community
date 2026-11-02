/**
 * cms-config.validator.spec.ts — JSON value 校验单测 (P0 2026-07-23)
 */
import { BadRequestException } from '@nestjs/common';
import {
  validateJsonValue,
  assertJsonSize,
  MAX_JSON_SIZE_BYTES,
  MAX_JSON_DEPTH,
} from './cms-config.validator';

describe('validateJsonValue (CMS admin JSON 校验)', () => {
  it('基础类型放行', () => {
    expect(() => validateJsonValue(null)).not.toThrow();
    expect(() => validateJsonValue('hello')).not.toThrow();
    expect(() => validateJsonValue(42)).not.toThrow();
    expect(() => validateJsonValue(true)).not.toThrow();
    expect(() => validateJsonValue(false)).not.toThrow();
  });

  it('object / array 嵌套校验', () => {
    expect(() => validateJsonValue({ a: 1, b: 'x' })).not.toThrow();
    expect(() => validateJsonValue([1, 'two', { three: 3 }])).not.toThrow();
    expect(() => validateJsonValue({ nested: { deep: { deeper: 'ok' } } })).not.toThrow();
  });

  it('超过 10 层嵌套抛 BadRequest', () => {
    let deep: any = { value: 'leaf' };
    for (let i = 0; i < MAX_JSON_DEPTH + 1; i++) {
      deep = { nested: deep };
    }
    expect(() => validateJsonValue(deep)).toThrow(BadRequestException);
  });

  it('正好 10 层放行', () => {
    // 顶层 + 9 nested = 10 层, leaf 在第 10 层
    let deep: any = { value: 'leaf' };
    for (let i = 0; i < MAX_JSON_DEPTH - 1; i++) {
      deep = { nested: deep };
    }
    expect(() => validateJsonValue(deep)).not.toThrow();
  });

  it('undefined / function / symbol 拒绝', () => {
    expect(() => validateJsonValue(undefined)).toThrow(BadRequestException);
    expect(() => validateJsonValue(() => 1)).toThrow(BadRequestException);
    expect(() => validateJsonValue(Symbol('x'))).toThrow(BadRequestException);
  });

  it('Date 对象拒绝 (避免歧义)', () => {
    expect(() => validateJsonValue(new Date())).toThrow(BadRequestException);
  });

  it('嵌套错误路径在 error message 里', () => {
    try {
      validateJsonValue({ outer: { inner: undefined } });
      fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).message).toContain('$.outer.inner');
    }
  });
});

describe('assertJsonSize (CMS admin JSON 大小限制)', () => {
  it('小 JSON 放行', () => {
    expect(() => assertJsonSize({ hello: 'world' })).not.toThrow();
    expect(() => assertJsonSize('a'.repeat(1000))).not.toThrow();
  });

  it('超过 64 KB 抛 BadRequest', () => {
    const huge = 'x'.repeat(MAX_JSON_SIZE_BYTES + 1);
    expect(() => assertJsonSize(huge)).toThrow(BadRequestException);
  });

  it('正好 64 KB 放行', () => {
    // JSON.stringify 会加 2 字节引号, 留 buffer
    const edge = 'x'.repeat(MAX_JSON_SIZE_BYTES - 4);
    expect(() => assertJsonSize(edge)).not.toThrow();
  });

  it('循环引用抛 BadRequest', () => {
    const a: any = { name: 'a' };
    const b: any = { name: 'b', ref: a };
    a.ref = b; // 循环
    expect(() => assertJsonSize(a)).toThrow(BadRequestException);
  });
});
