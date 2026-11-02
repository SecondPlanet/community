/**
 * videoProgress — v1.9-alpha.1 (A-10) 自动完成判定纯函数测试
 */
import { describe, it, expect } from 'vitest';
import { shouldAutoCompleteVideo, AUTO_COMPLETE_RATIO } from './videoProgress';

const baseArgs = {
  firedLessonId: null as string | null,
  currentLessonId: 'lesson-1',
  alreadyCompleted: false,
  isSubmitting: false,
};

describe('shouldAutoCompleteVideo (A-10)', () => {
  it('ratio >= 0.9 且其他条件都满足 → true', () => {
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 95, duration: 100 })).toBe(true);
  });

  it('AUTO_COMPLETE_RATIO 边界: ratio == 0.9 → true', () => {
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 9, duration: 10 })).toBe(true);
  });

  it('ratio 0.89 → false', () => {
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 89, duration: 100 })).toBe(false);
  });

  it('duration=0(还在加载 metadata)→ false', () => {
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 0, duration: 0 })).toBe(false);
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 5, duration: 0 })).toBe(false);
  });

  it('duration 负数 → false', () => {
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 5, duration: -1 })).toBe(false);
  });

  it('duration=NaN(视频源异常)→ false (NaN >= 0.9 是 false,行为锁定)', () => {
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 95, duration: Number.NaN })).toBe(false);
  });

  it('duration=Infinity(直播流)→ false (永远 0/Infinity)', () => {
    expect(shouldAutoCompleteVideo({ ...baseArgs, currentTime: 100, duration: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('alreadyCompleted=true → false (防止后端已完成又重发)', () => {
    expect(
      shouldAutoCompleteVideo({ ...baseArgs, currentTime: 95, duration: 100, alreadyCompleted: true }),
    ).toBe(false);
  });

  it('isSubmitting=true → false (防抖,在飞请求期间不重发)', () => {
    expect(
      shouldAutoCompleteVideo({ ...baseArgs, currentTime: 95, duration: 100, isSubmitting: true }),
    ).toBe(false);
  });

  it('firedLessonId === currentLessonId → false (本课时已触发过,防止每秒重发)', () => {
    expect(
      shouldAutoCompleteVideo({
        ...baseArgs,
        currentTime: 99,
        duration: 100,
        firedLessonId: 'lesson-1',
      }),
    ).toBe(false);
  });

  it('firedLessonId 是别的 lesson(切课时被 reset)→ 允许触发', () => {
    expect(
      shouldAutoCompleteVideo({
        ...baseArgs,
        currentTime: 95,
        duration: 100,
        firedLessonId: 'lesson-0',
      }),
    ).toBe(true);
  });

  it('阈值常量与设计一致', () => {
    expect(AUTO_COMPLETE_RATIO).toBe(0.9);
  });
});
