/**
 * videoProgress.ts — 视频进度判定纯函数
 *
 * v1.9-alpha.1 (A-10) 抽出。PlatformLearningContainer 的 handleVideoTimeUpdate
 * 需要在 currentTime/duration 比例达标时触发自动 completeLesson。把判定
 * 抽成纯函数便于 Vitest 直接覆盖,不依赖 React 树。
 */

/** 触发自动完成的阈值,与 FEATURES / 设计保持一致 */
export const AUTO_COMPLETE_RATIO = 0.9;

/**
 * 是否应该自动触发 completeLesson。
 *
 * @param currentTime 当前播放时间(秒)
 * @param duration    视频总时长(秒)
 * @param firedLessonId 上一次自动触发过的 lesson id(防止重发)
 * @param currentLessonId 当前 lesson id
 * @param alreadyCompleted 后端是否已经标过完成
 * @param isSubmitting 是否正在提交(防抖)
 */
export function shouldAutoCompleteVideo(args: {
  currentTime: number;
  duration: number;
  firedLessonId: string | null;
  currentLessonId: string;
  alreadyCompleted: boolean;
  isSubmitting: boolean;
}): boolean {
  if (args.duration <= 0) return false;
  if (args.alreadyCompleted) return false;
  if (args.isSubmitting) return false;
  if (args.firedLessonId === args.currentLessonId) return false;
  const ratio = args.currentTime / args.duration;
  return ratio >= AUTO_COMPLETE_RATIO;
}
