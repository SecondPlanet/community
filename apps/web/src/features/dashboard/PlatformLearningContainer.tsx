/**
 * DashboardPage — P0-6 学习中心三栏布局
 *
 * 严格按 review/mocks/mock-learn.html 落地:
 *   - 左 280-320px 课程大纲(折叠模块 → 课时,每课时显示 title + 时长 + 状态)
 *   - 中 1fr 视频 + tabs(笔记/字幕/资源) + sticky 完成按钮
 *   - 右 360-400px 课程导师，直接在当前学习上下文中对话
 *
 * 响应式:
 *   - lg+ (≥1024px): 三栏并排
 *   - md (768-1023): 两栏(隐藏 AI 右栏,改 FAB 抽屉),AI 抽屉复用同一组件
 *   - sm/mobile (<768): 单栏 + 顶部 3 tab 切换(大纲/视频/AI)
 *
 * 数据策略:
 *   - 1) 优先用 coursesApi + progressApi 拉真实数据
 *   - 2) 失败 / 401 / 网络错 → 渲染 QueryErrorState(v1.4.1 修复,无 mock fallback)
 *   - 3) LearningEvent 视频上报走真实后端(v1.4.1 上线)
 *
 *   - 课程助教有独立的嵌入式交互，不复用首页 WebAssistantDrawer 浮层
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  CheckCircle2,
  Lock,
  PlayCircle,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Paperclip,
  FileText,
  MessageSquare,
  Paperclip as AttachIcon,
  BookOpen,
  Clock,
  Pencil,
  Trash2,
  X,
  ExternalLink,
} from 'lucide-react';
import api from '../../lib/api';
import { certificatesApi } from '../../lib/certificatesApi';
import type { Certificate } from '@secondplanet/shared-types';
import { progressApi } from '../../lib/progressApi';
import { createEventBuffer, learningEventsApi } from '../../lib/learningEventsApi';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { QueryErrorState } from '../../components/QueryErrorState';
import { useToast } from '../../components/auth/Toast';
import { cn } from '../../lib/cn';
import { notesApi, type LessonNote } from '../../lib/notesApi';
import { isDirectVideoUrl, normalizeEmbeddedVideoUrl } from '../../lib/videoUrl';
import { shouldAutoCompleteVideo } from '../../lib/videoProgress';
import { useYoutubeProgress } from './useYoutubeProgress';
import { friendlySendError } from '../../lib/chatErrors';
import {
  chatApi,
  streamChatMessage,
  stripSourceMarkers,
  type ChatMessage,
  type ChatSource,
} from '../../lib/chatApi';
import { WebAssistantInput } from '../../components/WebAssistant/WebAssistantInput';
import { useChatCapability } from '../../hooks/useChatCapability';
import { Button } from '../../components/ui/Button';
import { LearningWorkspace } from './components/LearningWorkspace';
import { Drawer } from '../../components/ui/Drawer';

// =============================================================
// 类型(与 CourseDetailPage / shared-types 兼容)
// =============================================================
interface Resource {
  id: string;
  title: string;
  url: string;
  type: 'pdf' | 'code' | 'link' | 'video' | 'audio';
  isLocked: boolean;
}

interface Lesson {
  id: string;
  title: string;
  description?: string;
  videoUrl?: string;
  videoDuration?: number; // 秒
  isPreview: boolean;
  orderIndex: number;
  resources: Resource[];
}

interface Chapter {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  description: string;
  instructor: string;
  duration: string;
  chapters: Chapter[];
}

// 课程进度记录(从 progressApi.getMyProgress 拿)
interface ProgressRecord {
  id: string;
  userId: string;
  courseId: string;
  lessonId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  lastPosition?: number | null;
}
// =============================================================
// 工具函数
// =============================================================
function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * v1.9-alpha.2 (batch-10 A-09): 给 iframe URL 加 start= (YouTube embed 续播)。
 * 只对 youtube.com apply 变体生效;B 站 / 其他源透传。
 * 不追加 start= 的条件:未拿到 resumePositionSec 或接近结尾 (< duration*0.95)。
 * 调用方在已经知道 duration 接近时会过滤,但这里 URL build 阶段没有 duration,
 * 所以把"接近结尾"的过滤放在 onLoadedMetadata / A-10 判断里 — start= 一个
 * 大数值(例如 1.5x 总时长)YouTube 会自动 clamp,不会 crash。
 */
export function withResumeStart(iframeSrc: string, resumePositionSec: number | null): string {
  if (resumePositionSec === null || resumePositionSec <= 5) return iframeSrc;
  try {
    const url = new URL(iframeSrc);
    if (url.hostname !== 'youtube.com' && !url.hostname.endsWith('.youtube.com')) {
      return iframeSrc;
    }
    if (!url.searchParams.get('start')) {
      url.searchParams.set('start', String(Math.floor(resumePositionSec)));
    }
    return url.toString();
  } catch {
    return iframeSrc;
  }
}

// 总 lesson 数
function totalLessons(chapters: Chapter[]): number {
  return chapters.reduce((sum, c) => sum + c.lessons.length, 0);
}

// 找当前 lesson
function findLessonById(chapters: Chapter[], lessonId: string): Lesson | null {
  for (const ch of chapters) {
    const l = ch.lessons.find((x) => x.id === lessonId);
    if (l) return l;
  }
  return null;
}

// =============================================================
// 1) 章节大纲(左栏 + mobile 大纲 tab)
// =============================================================
function ChapterOutline({
  chapters,
  completedSet,
  currentLessonId,
  inProgressLessonId,
  onSelect,
}: {
  chapters: Chapter[];
  completedSet: Set<string>;
  currentLessonId: string;
  inProgressLessonId: string;
  onSelect: (lesson: Lesson) => void;
}) {
  // 当前 lesson 所在 chapter 默认展开;其他折叠
  const [openChapters, setOpenChapters] = useState<Set<string>>(() => {
    const cur = chapters.find((c) => c.lessons.some((l) => l.id === currentLessonId));
    return new Set(cur ? [cur.id] : [chapters[0]?.id]);
  });

  const toggleChapter = (id: string) => {
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const total = totalLessons(chapters);
  const completedCount = chapters
    .flatMap((c) => c.lessons)
    .filter((l) => completedSet.has(l.id)).length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  return (
    <div className="flex flex-col h-full bg-neutral-0 dark:bg-neutral-100">
      {/* 顶部:课程进度 */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-200">
        <h3 className="font-semibold text-sm text-neutral-900 dark:text-neutral-900">课程大纲</h3>
        <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-600">
          共 {chapters.length} 个模块 · {completedCount} / {total} 课时已完成
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-200 overflow-hidden">
          <div
            className="h-full bg-[#171717] transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] font-mono text-neutral-600 dark:text-neutral-600 text-right">
          {percent}%
        </div>
      </div>

      {/* 模块列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {chapters.map((chapter, ci) => {
          const isOpen = openChapters.has(chapter.id);
          const chapterCompletedCount = chapter.lessons.filter((l) => completedSet.has(l.id)).length;
          const isCurrentChapter = chapter.lessons.some((l) => l.id === currentLessonId);
          // 章节徽章颜色
          const isChapterDone = chapterCompletedCount === chapter.lessons.length;
          return (
            <div key={chapter.id}>
              <button
                onClick={() => toggleChapter(chapter.id)}
                className={cn(
                  'w-full flex items-center gap-2 p-2 rounded-md transition-colors text-left',
                  'hover:bg-neutral-50 dark:hover:bg-neutral-50',
                )}
              >
                <span
                  className={cn(
                    'w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0',
                    isChapterDone
                      ? 'bg-success-500 text-neutral-0'
                      : isCurrentChapter
                        ? 'bg-[#171717] text-white'
                        : 'bg-neutral-200 dark:bg-neutral-200 text-neutral-600 dark:text-neutral-600',
                  )}
                >
                  {ci + 1}
                </span>
                <span className="text-sm font-medium flex-1 truncate text-neutral-900 dark:text-neutral-900">
                  {chapter.title}
                </span>
                <span className="text-xs text-neutral-600 dark:text-neutral-600 font-mono shrink-0">
                  {chapterCompletedCount}/{chapter.lessons.length}
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-neutral-600 transition-transform shrink-0',
                    isOpen ? '' : '-rotate-90',
                  )}
                />
              </button>
              {isOpen && (
                <div className="ml-3 pl-3 border-l border-neutral-200 dark:border-neutral-200 space-y-0.5 mt-1">
                  {chapter.lessons.map((lesson) => {
                    const isCompleted = completedSet.has(lesson.id);
                    const isInProgress = lesson.id === inProgressLessonId;
                    const isCurrent = lesson.id === currentLessonId;
                    const isLocked = !lesson.isPreview && !isCompleted && !isInProgress && !isCurrent;
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => !isLocked && onSelect(lesson)}
                        disabled={isLocked}
                        className={cn(
                          'w-full flex items-center gap-2 p-2 rounded text-xs text-left transition-colors',
                          isCurrent
                            ? 'bg-[#171717] text-white hover:bg-[#262626]'
                            : isLocked
                              ? 'opacity-50 cursor-not-allowed text-neutral-600 dark:text-neutral-600'
                              : 'hover:bg-neutral-50 dark:hover:bg-neutral-50 text-neutral-900 dark:text-neutral-900',
                        )}
                      >
                        {/* 状态图标 */}
                        {isCompleted ? (
                          <CheckCircle2
                            className={cn(
                              'w-3.5 h-3.5 shrink-0',
                              isCurrent ? 'text-neutral-0' : 'text-success-500',
                            )}
                          />
                        ) : isInProgress && !isCurrent ? (
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-[#171717] border-t-transparent animate-spin shrink-0" />
                        ) : isLocked ? (
                          <Lock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        ) : (
                          <PlayCircle
                            className={cn(
                              'w-3.5 h-3.5 shrink-0',
                              isCurrent ? 'text-neutral-0' : 'text-neutral-600',
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            'flex-1 truncate',
                            isCompleted && !isCurrent && 'line-through opacity-60',
                          )}
                        >
                          {lesson.title}
                        </span>
                        <span
                          className={cn(
                            'font-mono text-[10px] shrink-0',
                            isCurrent ? 'text-neutral-0/80' : 'text-neutral-600',
                          )}
                        >
                          {formatDuration(lesson.videoDuration || 0)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================
// 2) 视频 + tabs(中栏 + mobile 视频 tab)
// =============================================================
type CenterTab = 'notes' | 'cc' | 'resources';

export function NotesPanel({
  lessonId,
  positionSec,
  onSeek,
}: {
  lessonId: string;
  positionSec: number;
  // v1.9-alpha.1 (A-03): 课程内点击笔记时间戳跳转到视频对应秒。
  // 仅当当前课时是直接 <video> 时由父组件注入;iframe/YouTube 传 undefined。
  onSeek?: (positionSec: number) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const notesQuery = useQuery({
    queryKey: ['lesson-notes', lessonId],
    queryFn: () => notesApi.list(lessonId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lesson-notes', lessonId] });
  const createNote = useMutation({
    mutationFn: () =>
      notesApi.create(lessonId, {
        content: draft.trim(),
        positionSec: Math.max(0, Math.round(positionSec)),
      }),
    onSuccess: () => {
      setDraft('');
      refresh();
    },
  });
  const updateNote = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      notesApi.update(id, { content }),
    onSuccess: refresh,
  });
  const deleteNote = useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    onSuccess: refresh,
  });

  useEffect(() => {
    const focusNoteInput = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key.toLowerCase() === 'n' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !target?.matches('input, textarea, [contenteditable="true"]')
      ) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusNoteInput);
    return () => window.removeEventListener('keydown', focusNoteInput);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-2">
      <form
        className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 dark:bg-neutral-100"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) createNote.mutate();
        }}
      >
        <label htmlFor="lesson-note" className="text-sm font-semibold">
          在 {formatDuration(Math.round(positionSec))} 添加笔记
        </label>
        <textarea
          ref={inputRef}
          id="lesson-note"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="记录本节重点、疑问或实践想法…"
          className="mt-2 w-full resize-y rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-[#171717]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-500">按 N 可快速聚焦输入框</span>
          <button
            type="submit"
            disabled={!draft.trim() || createNote.isPending}
            className="min-h-10 rounded-md bg-[#171717] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {createNote.isPending ? '保存中…' : '保存笔记'}
          </button>
        </div>
        {createNote.isError && <p className="mt-2 text-xs text-red-600">保存失败，请稍后重试。</p>}
      </form>

      {notesQuery.isLoading ? (
        <Skeleton variant="text" count={4} />
      ) : notesQuery.isError ? (
        <QueryErrorState error={notesQuery.error} onRetry={() => notesQuery.refetch()} />
      ) : notesQuery.data?.length ? (
        <div className="space-y-3">
          {notesQuery.data.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onUpdate={(content) => updateNote.mutate({ id: note.id, content })}
              onDelete={() => deleteNote.mutate(note.id)}
              busy={updateNote.isPending || deleteNote.isPending}
              onSeek={onSeek}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="还没有笔记"
          description="在上方记录第一条笔记，它会与当前视频时间点一起保存。"
        />
      )}
    </div>
  );
}

function NoteItem({
  note,
  onUpdate,
  onDelete,
  busy,
  onSeek,
}: {
  note: LessonNote;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  busy: boolean;
  onSeek?: (positionSec: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);

  return (
    <article className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 dark:bg-neutral-100">
      <div className="flex items-start justify-between gap-3">
        {/* v1.9-alpha.1 (A-03 + B-07): 时间戳可点击跳转到视频对应秒,
            键盘可聚焦,屏幕阅读器可读。iframe/YouTube 课时降级为纯文本。 */}
        {note.positionSec != null && onSeek ? (
          <button
            type="button"
            onClick={() => onSeek(note.positionSec!)}
            aria-label={`跳转到 ${formatDuration(note.positionSec)}`}
            className="rounded font-mono text-xs text-[#171717] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171717]"
          >
            {formatDuration(note.positionSec)}
          </button>
        ) : (
          <span className="font-mono text-xs text-neutral-500">
            {note.positionSec == null ? '无时间戳' : formatDuration(note.positionSec)}
          </span>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="min-h-10 min-w-10 rounded-md p-2 hover:bg-neutral-100"
            aria-label="编辑笔记"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="min-h-10 min-w-10 rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
            aria-label="删除笔记"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {editing ? (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = content.trim();
            if (!next) return;
            onUpdate(next);
            setEditing(false);
          }}
        >
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={3}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-2 text-xs">
              取消
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-[#171717] px-3 py-2 text-xs text-white">
              保存修改
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{note.content}</p>
      )}
    </article>
  );
}

function VideoCenter({
  course,
  currentLesson,
  completedSet,
  onMarkComplete,
  onNavigate,
  isCompleting,
}: {
  course: Course;
  currentLesson: Lesson;
  completedSet: Set<string>;
  onMarkComplete: (lessonId: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  isCompleting: boolean;
}) {
  // v1.9-alpha.2 (batch-10 A-09): 续播 toast 由本组件自己持有 (UI 内提示)
  const { showToast } = useToast();
  const [centerTab, setCenterTab] = useState<CenterTab>('notes');
  const [videoTime, setVideoTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  // v1.9-alpha.2 (batch-10 A-09): 续播位置 — 切到新课时先 fetch,
  // 直接 <video> onLoadedMetadata 时 seek 到该位置;YouTube 在 URL 加 start=。
  const [resumePositionSec, setResumePositionSec] = useState<number | null>(null);
  const lastReportedSecond = useRef(-1);
  // v1.9-alpha.1 (A-03): 笔记时间戳 → video.currentTime 跳转。
  // <video key={lesson.id}> 切课时 remount,ref 每次 commit 重新赋值,
  // 卸载时 React 置 null — 直接写 useRef 对象即可(与 callback ref 时机相同)。
  // 只在直接 <video>(mp4/webm) 时挂;iframe/YouTube 无法 seek 跨域视频。
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  // v1.9-alpha.2 (batch-10 A-09): YouTube iframe ref, 供 useYoutubeProgress 用
  // YT.Player 包住 <iframe>(enablejsapi=1 + 官方 iframe_api, plan §3.6)。
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  // v1.9-alpha.1 (A-10): 防止 90% 阈值重复触发 completeLesson。
  // 切课时在下面的 useEffect 重置。
  const autoCompleteFiredRef = useRef<string | null>(null);

  // v1.4.1: LearningEvent 上报 — 用缓冲器每 5s push,30s flush 一次
  // 改用真实后端 /api/v1/learning-events/batch,跨设备同步
  const eventBufferRef = useRef<ReturnType<typeof createEventBuffer> | null>(null);

  useEffect(() => {
    const buf = createEventBuffer(30_000);
    buf.start();
    eventBufferRef.current = buf;
    return () => {
      buf.stop();
      eventBufferRef.current = null;
    };
  }, []);

  useEffect(() => {
    setVideoTime(0);
    setMediaDuration(currentLesson.videoDuration ?? 0);
    lastReportedSecond.current = -1;
    // v1.9-alpha.1 (A-10): 切课时清自动完成标记
    autoCompleteFiredRef.current = null;
  }, [currentLesson.id, currentLesson.videoDuration]);

  // v1.9-alpha.2 (batch-10 A-09): 拉取该课时上次位置 → resumePositionSec
  // (>5 秒且 < duration*0.95 才算"续播",避免接近结尾被推到尽头)。
  useEffect(() => {
    let cancelled = false;
    setResumePositionSec(null);
    learningEventsApi.getMyPositionForLesson(currentLesson.id).then((pos) => {
      if (cancelled) return;
      if (pos !== null && pos > 5) {
        setResumePositionSec(pos);
        const mm = Math.floor(pos / 60);
        const ss = Math.floor(pos % 60);
        showToast(`已从 ${mm}:${ss.toString().padStart(2, '0')} 继续`, 'success', 2500);
      }
    }).catch(() => {
      /* 续播探测失败不影响主流程 */
    });
    return () => {
      cancelled = true;
    };
  }, [currentLesson.id, showToast]);

  // v1.9-alpha.2 (batch-10 A-09): YouTube 进度上报 — 两条路径并行。
  //   - 主路径 (useYoutubeProgress hook): 官方 iframe_api + YT.Player.getCurrentTime()
  //     每 5s 推入 eventBuffer (plan §3.6, CSP 已放行 https://www.youtube.com)。
  //   - 备用路径 (下面的 postMessage 监听): 旧依赖, YT.Player 加载失败或被某些环境
  //     屏蔽时仍能记录播放位置。两条路径共享 ytLastReportedRef 去重。
  const ytLastReportedRef = useRef(-1);
  // v1.9-alpha.2 (batch-10 A-09): 启用官方 iframe_api 主路径 hook
  useYoutubeProgress({
    iframeRef: ytIframeRef,
    videoUrl: currentLesson.videoUrl,
    lessonId: currentLesson.id,
    courseId: course.id,
    ytLastReportedRef,
    eventBufferRef,
    setMediaDuration,
  });
  // postMessage fallback — 保留, 上面的 hook 加载失败时仍能记录位置
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMessage = (event: MessageEvent) => {
      // 跨源保护: 只信任 youtube.com
      if (event.origin !== 'https://www.youtube.com') return;
      const data = event.data as { event?: string; info?: { currentTime?: number; duration?: number } };
      if (data?.event !== 'infoDelivery' && data?.event !== 'onStateChange') return;
      const currentTime = data?.info?.currentTime;
      const duration = data?.info?.duration;
      if (typeof currentTime !== 'number' || !isFinite(currentTime)) return;
      // duration 用于 A-10 自动完成判定;直接 update 到 mediaDuration 状态
      if (typeof duration === 'number' && isFinite(duration) && duration > 0) {
        setMediaDuration(duration);
      }
      const pos = Math.floor(currentTime);
      if (pos > 0 && pos % 5 === 0 && pos !== ytLastReportedRef.current) {
        ytLastReportedRef.current = pos;
        eventBufferRef.current?.push({
          eventType: 'play',
          lessonId: currentLesson.id,
          positionSec: pos,
          metadata: { courseId: course.id, source: 'youtube-postmessage' },
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [currentLesson.id, course.id, setMediaDuration]);

  const handleVideoTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const positionSec = Math.floor(event.currentTarget.currentTime);
    setVideoTime(event.currentTarget.currentTime);
    if (positionSec > 0 && positionSec % 5 === 0 && positionSec !== lastReportedSecond.current) {
      lastReportedSecond.current = positionSec;
      eventBufferRef.current?.push({
        eventType: 'play',
        lessonId: currentLesson.id,
        positionSec,
        metadata: { courseId: course.id },
      });
    }
    // v1.9-alpha.1 (A-10): UX-AUDIT-2026-09-11 C-29 — 看完 ≥90% 自动标完成。
    // 仅作用于直接 <video>(src=mp4/webm 等);iframe/YouTube 路径不发 time 事件,
    // 等 IFrame Player API 接入再说。ref guard 防止每秒重发直到后端 invalidate。
    // 判定逻辑抽到 lib/videoProgress.ts 便于纯函数测试。
    const video = event.currentTarget;
    if (
      shouldAutoCompleteVideo({
        currentTime: video.currentTime,
        duration: video.duration,
        firedLessonId: autoCompleteFiredRef.current,
        currentLessonId: currentLesson.id,
        alreadyCompleted: completedSet.has(currentLesson.id),
        isSubmitting: isCompleting,
      })
    ) {
      autoCompleteFiredRef.current = currentLesson.id;
      onMarkComplete(currentLesson.id);
    }
  };

  const isCurrentCompleted = completedSet.has(currentLesson.id);
  const allLessons = course.chapters.flatMap((c) => c.lessons);
  const currentIdx = allLessons.findIndex((l) => l.id === currentLesson.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < allLessons.length - 1;

  // v1.9-alpha.1 (A-01): 删除 'qa' tab (UX-AUDIT-2026-09-11 C-17)。原占位
  // EmptyState 写"问答功能开发中"对学员是误导 — 真功能正在课程内右侧 AI Tutor。
  const tabs: Array<{ id: CenterTab; label: string; count?: number; icon: React.ReactNode }> = [
    { id: 'notes', label: '笔记', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'cc', label: '字幕', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'resources', label: '资源', count: currentLesson.resources?.length, icon: <AttachIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-50 dark:bg-neutral-50">
      {/* 视频区：限制视口占比，确保下方笔记/资源始终有可用空间 */}
      <div className="relative flex h-[clamp(210px,34dvh,360px)] shrink-0 items-center justify-center bg-black text-white">
        {!currentLesson.videoUrl ? (
          <div className="text-center px-6">
            <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">本课时暂未上传视频</p>
          </div>
        ) : isDirectVideoUrl(currentLesson.videoUrl) ? (
          <video
            key={currentLesson.id}
            ref={videoElementRef}
            src={currentLesson.videoUrl}
            title={currentLesson.title}
            className="w-full h-full"
            controls
            playsInline
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const realDuration = video.duration || currentLesson.videoDuration || 0;
              setMediaDuration(realDuration);
              // v1.9-alpha.2 (batch-10 A-09): 续播 seek (直接 <video>)
              if (
                resumePositionSec !== null &&
                resumePositionSec < realDuration * 0.95
              ) {
                try {
                  video.currentTime = resumePositionSec;
                } catch {
                  /* 某些浏览器在未完全加载前设 currentTime 会抛错,吞掉即可 */
                }
              }
            }}
            onTimeUpdate={handleVideoTimeUpdate}
          />
        ) : (
          <>
            <iframe
              key={currentLesson.id}
              // v1.9-alpha.2 (batch-10 A-09): YouTube embed URL 已含 enablejsapi=1&origin;
              // resumePositionSec>5 且 < duration*0.95 时附加 start= 让续播可见。
              src={withResumeStart(normalizeEmbeddedVideoUrl(currentLesson.videoUrl), resumePositionSec)}
              // 官方 iframe_api 用 id 找 <iframe>;enablejsapi=1 让 YT.Player
              // 直接接管这个节点, 不需要客户端 postMessage 'listening'。
              id={`yt-embed-${currentLesson.id}`}
              ref={ytIframeRef}
              title={currentLesson.title}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
            <a
              href={currentLesson.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-3 right-3 z-10 bg-white text-[#171717] px-3 py-2 text-[10px] font-black uppercase tracking-widest border border-[#171717]"
            >
              无法播放？新窗口打开 ↗
            </a>
          </>
        )}
      </div>

      {/* 课程标题 + lesson 标题 + 讲师 */}
      <div className="px-4 sm:px-6 py-3 border-b border-neutral-200 dark:border-neutral-200 bg-neutral-0 dark:bg-neutral-100 shrink-0">
        <div className="text-[10px] uppercase tracking-widest text-neutral-600 dark:text-neutral-600 font-medium">
          / {course.title}
        </div>
        <h2 className="mt-0.5 text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-900 leading-tight">
          {currentLesson.title}
        </h2>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-600">
          <BookOpen className="w-3.5 h-3.5" />
          <span>讲师 {course.instructor}</span>
          <span>·</span>
          <Clock className="w-3.5 h-3.5" />
          <span>{formatDuration(mediaDuration || currentLesson.videoDuration || 0)}</span>
          {isCurrentCompleted && (
            <span className="ml-auto inline-flex items-center gap-1 text-success-500">
              <CheckCircle2 className="w-3.5 h-3.5" /> 已完成
            </span>
          )}
        </div>
      </div>

      {/* Tabs: 笔记 / 字幕 / 资源 / 问答 */}
      <div className="sticky top-0 z-10 flex shrink-0 overflow-x-auto overflow-y-hidden border-b border-neutral-200 bg-neutral-0 px-4 dark:border-neutral-200 dark:bg-neutral-100 sm:px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setCenterTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              centerTab === t.id
                ? 'border-[#171717] text-[#171717]'
                : 'border-transparent text-neutral-600 dark:text-neutral-600 hover:text-[#171717]',
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && <span className="text-[10px] opacity-70">· {t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div
        className="min-h-0 flex-1 overscroll-contain overflow-y-scroll bg-neutral-50 p-4 [scrollbar-color:#a3a3a3_transparent] [scrollbar-gutter:stable] dark:bg-neutral-50 sm:p-6"
        data-testid="lesson-tab-scroll"
      >
        {centerTab === 'notes' && (
          <NotesPanel
            lessonId={currentLesson.id}
            positionSec={videoTime}
            onSeek={
              isDirectVideoUrl(currentLesson.videoUrl)
                ? (sec) => {
                    const video = videoElementRef.current;
                    if (video) {
                      video.currentTime = sec;
                      video.play().catch(() => {
                        /* autoplay 拒绝时只 seek,不强推播放 */
                      });
                    }
                  }
                : undefined
            }
          />
        )}

        {centerTab === 'cc' && (
          <div className="max-w-3xl">
            <EmptyState
              icon={<FileText className="w-5 h-5" />}
              title="字幕暂未提供"
              description="本节字幕由讲师或社区提供,目前还没有上传。你可以先看视频或切换到「笔记」做记录。"
            />
          </div>
        )}

        {centerTab === 'resources' && (
          <div className="max-w-3xl space-y-2">
            {currentLesson.resources && currentLesson.resources.length > 0 ? (
              currentLesson.resources.map((r) => (
                <a
                  key={r.id}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-200 bg-neutral-0 dark:bg-neutral-100 hover:border-[#171717] transition-colors"
                >
                  <span className="w-9 h-9 rounded-md bg-[#EEEDE9] text-[#171717] flex items-center justify-center text-xs font-bold shrink-0">
                    {r.type.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-neutral-900 dark:text-neutral-900">
                      {r.title}
                    </div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-600 truncate">
                      {r.url}
                    </div>
                  </div>
                  <span className="text-xs text-[#171717]">打开</span>
                </a>
              ))
            ) : (
              <EmptyState
                icon={<Paperclip className="w-5 h-5" />}
                title="本节暂无资源"
                description="讲师还没上传配套资料"
              />
            )}
          </div>
        )}
      </div>

      {/* 底部完成按钮 */}
      <div className="border-t border-neutral-200 dark:border-neutral-200 bg-neutral-0 dark:bg-neutral-100 p-3 sm:p-4 flex items-center justify-between gap-2 shrink-0">
        {/* v1.9-alpha.1 (B-12): WCAG 2.5.5 触控目标 ≥44px;min-h-11 = 44px */}
        <button
          onClick={() => onNavigate('prev')}
          disabled={!hasPrev}
          className="min-h-11 min-w-11 px-3 sm:px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-200 text-xs sm:text-sm hover:border-[#171717] disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 dark:text-neutral-900 flex items-center justify-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">上一节</span>
        </button>
        <span className="text-[10px] sm:text-xs text-neutral-600 dark:text-neutral-600 hidden md:inline">
          完成本节获得积分 + 进度推进
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMarkComplete(currentLesson.id)}
            disabled={isCompleting || isCurrentCompleted}
            className="min-h-11 min-w-11 px-3 sm:px-4 py-2 rounded-md bg-[#171717] text-white text-xs sm:text-sm font-medium hover:bg-[#262626] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-1"
          >
            {isCurrentCompleted ? '已完成' : isCompleting ? '提交中…' : '标记完成'}
          </button>
          <button
            onClick={() => onNavigate('next')}
            disabled={!hasNext}
            aria-label="下一节"
            className="min-h-11 min-w-11 px-3 sm:px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-200 text-xs sm:text-sm hover:border-[#171717] disabled:opacity-50 disabled:cursor-not-allowed text-neutral-900 dark:text-neutral-900 flex items-center justify-center gap-1"
          >
            <span className="hidden sm:inline">下一节</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// 3) 课程导师（右栏 + mobile 导师 tab + tablet 抽屉）
// =============================================================
function CourseRagMessage({
  message,
  sources,
  pending,
}: {
  message: ChatMessage;
  sources?: ChatSource[];
  pending?: boolean;
}) {
  const isUser = message.role === 'user';
  if (message.role === 'system') return null;

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[88%] flex-col', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-md px-3 py-2 text-sm leading-relaxed',
            isUser
              ? 'rounded-br-sm bg-[#171717] text-white'
              : 'rounded-bl-sm border border-neutral-200 bg-neutral-50 text-neutral-900',
          )}
        >
          {pending ? (
            <div className="flex min-w-[140px] items-center gap-2 text-xs text-neutral-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              正在检索当前课程资料…
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
        {!isUser && sources && sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="RAG 引用来源">
            {sources.map((source) => (
              <a
                key={`${source.type}-${source.id}`}
                href={source.url}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 transition-colors hover:border-[#171717]"
                title={source.title}
              >
                <BookOpen className="h-3 w-3 shrink-0" />
                <span className="truncate">{source.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AiAssistant({
  courseId,
  courseTitle,
  currentLessonId,
  currentLessonTitle,
  resourceCount,
  onClose,
}: {
  courseId: string;
  courseTitle: string;
  currentLessonId: string;
  currentLessonTitle: string;
  resourceCount: number;
  onClose?: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sourcesByMessage, setSourcesByMessage] = useState<Record<string, ChatSource[]>>({});
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  // v1.9-alpha.2 (batch-5b C-02): 首个 delta 前显示骨架; 流占位消息 id
  const [hasStreamText, setHasStreamText] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // v1.9-alpha.2 (batch-6 A-08): 闸门 — 无 BYOK + 平台关停/未配置 → 禁用输入。
  const { enabled: chatEnabled, reason: chatDisabledReason } = useChatCapability();
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(null);
    setMessages([]);
    setSourcesByMessage({});
    setDraft('');
    setSendError(null);
  }, [currentLessonId]);

  // v1.9-alpha.2 (batch-5b C-02): 切课时/关闭面板/卸载时中止进行中的流 —
  // 后端 req close → abort → partial 保存, 不烧 token。
  const abortActiveStream = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }, []);
  useEffect(() => {
    abortActiveStream();
    setHasStreamText(false);
  }, [currentLessonId, abortActiveStream]);
  useEffect(() => {
    return () => abortActiveStream();
  }, [abortActiveStream]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, isSending]);

  const sendQuestion = async (preset?: string) => {
    const question = (preset ?? draft).trim();
    if (!question || isSending) return;
    // v1.9-alpha.2 (batch-6 A-08): 闸门关闭时不发, 避免后端 429/503 + 用户看到错误条。
    if (!chatEnabled) return;

    const optimisticId = `course-rag-${Date.now()}`;
    const streamingId = `course-stream-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: optimisticId, role: 'user', content: question, createdAt: new Date().toISOString() },
      { id: streamingId, role: 'assistant', content: '', createdAt: new Date().toISOString() },
    ]);
    setDraft('');
    setIsSending(true);
    setSendError(null);
    setHasStreamText(false);

    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    let streamed = '';

    try {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        // v1.9-alpha.1 (B-05): 带 lessonId/courseId 创建 → 后端 listSessions
        // (lessonId:null 过滤) 自动把课程会话排除在全站助手列表外。
        const created = await chatApi.createSession(`课程 RAG · ${courseTitle} · ${currentLessonTitle}`, {
          lessonId: currentLessonId,
          courseId,
        });
        activeSessionId = created.sessionId;
        setSessionId(activeSessionId);
      }

      // v1.9-alpha.2 (batch-5b C-02): SSE 流式 — delta 边收边剥 [[src:]] 标记
      // (含未闭合尾巴), done 用服务端最终 content/sources 收尾。
      await streamChatMessage(
        activeSessionId,
        question,
        {
          onDelta: (delta) => {
            streamed += delta;
            setHasStreamText(true);
            setMessages((current) =>
              current.map((m) =>
                m.id === streamingId ? { ...m, content: stripSourceMarkers(streamed) } : m,
              ),
            );
          },
          onDone: (payload) => {
            // v1.9-alpha.2 (batch-5b Claude acceptance B3): 保留用户问题。
            // 把 optimisticUser 的 id 改写为服务端 userMsgId, 仅去掉流式占位。
            const finalId = payload.assistantMsgId;
            setMessages((current) => {
              const next = current
                .filter((m) => m.id !== streamingId)
                .map((m) => (m.id === optimisticId ? { ...m, id: payload.userMsgId } : m));
              return [
                ...next,
                { id: finalId, role: 'assistant', content: payload.content, createdAt: new Date().toISOString() },
              ];
            });
            setSourcesByMessage((current) => ({
              ...current,
              [finalId]: payload.sources,
            }));
          },
          onError: (payload) => {
            if (payload.partialSaved) {
              // 服务端已存部分回答 (chat.service 的 error 事件不带 assistantMsgId,
              // 下次 listMessages refetch 会以服务端记录为准)。
              setMessages((current) => [
                ...current.filter((m) => m.id !== streamingId),
                {
                  // 占位用 streamingId, refetch 后会与 DB 主键对齐(若不重则下次
                  // 再发起 send 时清理。简单的处理: 给一个本地 id 即可)。
                  id: `course-partial-${Date.now()}`,
                  role: 'assistant',
                  content: stripSourceMarkers(streamed),
                  createdAt: new Date().toISOString(),
                },
              ]);
              setSendError(payload.message);
            } else {
              // v1.9-alpha.2 (batch-5b Claude acceptance nb-e): 服务端已删 user message,
              // 这里也要一并删, 防止列表与 DB 不一致。
              setMessages((current) =>
                current.filter((m) => m.id !== optimisticId && m.id !== streamingId),
              );
              setSendError(friendlySendError(new Error(payload.message)));
              setDraft(question);
            }
          },
        },
        abortController.signal,
      );
    } catch (err: unknown) {
      // v1.9-alpha.2 (batch-5b Claude acceptance nb-d): 切课时/关面板 → AbortError,
      // 不应弹错。后端 partial 已存, 静默吞。
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((current) => current.filter((m) => m.id !== streamingId));
        return;
      }
      // v1.9-alpha.1 (B-03): 不区分错误来源的写死提示改走共享 friendlySendError。
      setMessages((current) =>
        current.filter((m) => m.id !== streamingId),
      );
      setSendError(friendlySendError(err));
      setDraft(question);
    } finally {
      streamAbortRef.current = null;
      setIsSending(false);
      setHasStreamText(false);
    }
  };

  const quickQuestions = ['梳理本节 3 个关键点', '出一道题检验我的理解', '结合实际案例解释本节内容'];

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-0 dark:bg-neutral-100" aria-label="课程导师">
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 px-4 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#171717] text-white">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">课程导师</h2>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">当前上下文</span>
          </div>
          <p className="truncate text-xs text-neutral-600">当前：{currentLessonTitle}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="关闭课程助教" className="rounded-md p-2 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="shrink-0 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5">
        <div className="flex flex-wrap gap-1.5 text-[11px] text-neutral-600">
          <span className="rounded-md border border-neutral-200 bg-white px-2 py-1">当前课程</span>
          <span className="rounded-md border border-neutral-200 bg-white px-2 py-1">当前课时</span>
          <span className="rounded-md border border-neutral-200 bg-white px-2 py-1">课件资源 {resourceCount}</span>
        </div>
      </div>

      <div ref={messageListRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-color:#a3a3a3_transparent] [scrollbar-gutter:stable]">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[260px] flex-col justify-center">
            <h3 className="text-lg font-bold">只聊这门课的内容</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              回答会自动携带当前课程和课时上下文，并展示命中的 RAG 来源，不会跳到首页助手。
            </p>
            <div className="mt-4 space-y-2">
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => sendQuestion(question)}
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-left text-sm transition-colors hover:border-[#171717] hover:bg-neutral-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <CourseRagMessage key={message.id} message={message} sources={sourcesByMessage[message.id]} />
          ))
        )}
        {/* v1.9-alpha.2 (batch-5b): 首个 delta 前显示 pending 骨架, 之后流式文本已在占位消息里 */}
        {isSending && !hasStreamText && (
          <CourseRagMessage
            pending
            message={{ id: 'course-rag-pending', role: 'assistant', content: '', createdAt: new Date().toISOString() }}
          />
        )}
      </div>

      {sendError && <div role="alert" className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{sendError}</div>}
      <div className="shrink-0">
        <WebAssistantInput
          value={draft}
          onChange={setDraft}
          onSend={() => sendQuestion()}
          isSending={isSending}
          // v1.9-alpha.2 (batch-6 A-08): 闸门关闭时禁用输入 + 覆盖默认占位
          disabled={!chatEnabled}
          placeholder={
            chatEnabled
              ? '基于当前课程提问…'
              : chatDisabledReason === 'BUDGET_DISABLED'
                ? 'AI 助教暂未启用（平台 AI 已临时关闭）'
                : 'AI 助教暂未启用'
          }
        />
        <p className="border-t border-neutral-100 px-4 py-2 text-center text-[10px] text-neutral-500">AI 回答可能有误，请以课程资料与官方文档为准</p>
      </div>
    </div>
  );
}

// =============================================================
// 主页面
// =============================================================
export function PlatformAssistantDrawer({
  open,
  onClose,
  courseId,
  courseTitle,
  lesson,
}: {
  open: boolean;
  onClose(): void;
  courseId: string;
  courseTitle: string;
  lesson: Lesson;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="课程导师" width={420}>
      <AiAssistant
        courseId={courseId}
        courseTitle={courseTitle}
        currentLessonId={lesson.id}
        currentLessonTitle={lesson.title}
        resourceCount={lesson.resources?.length ?? 0}
      />
    </Drawer>
  );
}

export function PlatformLearningContainer({ courseId: routeCourseId, lessonId: routeLessonId }: { courseId: string; lessonId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // v1.9-alpha.2 (batch-7 C-05): 课程刚完成 → 弹祝贺卡片; 关闭后 null。
  const [completionCard, setCompletionCard] = useState<{
    certificateCount: number;
    similar: Array<{
      id: string;
      title: string;
      thumbnail: string;
      level: string;
      ratingAvg: number;
      ratingCount: number;
    }>;
  } | null>(null);
  const navigate = useNavigate();
  // 移动端顶部 tab 切换(大纲 / 视频 / AI)
  const [mobileTab, setMobileTab] = useState<'outline' | 'video' | 'ai'>('video');
  // tablet 抽屉 AI
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  // URL params are the sole source of truth for the selected lesson.
  const currentLessonId = routeLessonId ?? '';

  // Canonical platform learning is URL-addressed. Missing params are handled by LegacyLearningRedirect.
  const selectedCourseId = routeCourseId;
  const courseQuery = useQuery({
    queryKey: ['dashboard-course', selectedCourseId],
    queryFn: async () => {
      const id = selectedCourseId;
      if (!id) throw new Error('no course');
      const { data } = await api.get<Course>(`/api/v1/courses/${id}`);
      return data;
    },
    enabled: !!selectedCourseId,
    retry: 0,
  });

  // 3) 拉我的进度
  const progressQuery = useQuery({
    queryKey: ['dashboard-progress'],
    queryFn: () => progressApi.getMyProgress(),
    retry: 0,
  });

  // === 数据归一化:API OK 用 API,失败用空 / null(无 mock fallback) ===
  const course: Course | null = useMemo(() => {
    if (courseQuery.data && courseQuery.data.chapters?.length) {
      return courseQuery.data;
    }
    return null;
  }, [courseQuery.data]);

  const completedSet = useMemo(() => {
    // 防御:progressQuery.data 可能是数组 / 包裹对象 / null(后端 schema 不稳)
    const raw = progressQuery.data;
    const records: ProgressRecord[] = Array.isArray(raw)
      ? (raw as ProgressRecord[])
      : Array.isArray((raw as any)?.data)
        ? ((raw as any).data as ProgressRecord[])
        : [];
    return new Set(records.filter((r) => r.status === 'completed').map((r) => r.lessonId));
  }, [progressQuery.data]);

  // UX-AUDIT-2026-09-11 C-04: 之前 inProgressLessonId={currentLessonId} 硬编码,
  // 导致大纲里除"当前课时"以外的所有 in_progress 课时被锁死。这里从 progress 拿真实值,
  // 与 currentLessonId 解耦:currentLessonId 跟随 URL / 大纲点击切换,
  // inProgressLessonId 反映后端 progress 表里最近一次 status='in_progress' 的课时。
  const inProgressLessonId = useMemo(() => {
    const raw = progressQuery.data;
    const records: ProgressRecord[] = Array.isArray(raw)
      ? (raw as ProgressRecord[])
      : Array.isArray((raw as any)?.data)
        ? ((raw as any).data as ProgressRecord[])
        : [];
    const hit = records.find(
      (record) => record.status === 'in_progress' && (!record.courseId || record.courseId === selectedCourseId),
    );
    return hit?.lessonId ?? null;
  }, [progressQuery.data, selectedCourseId]);

  // 课程详情异步加载后初始化当前课时，避免导航索引停留在 -1。
  useEffect(() => {
    if (!course || progressQuery.isLoading) return;
    const lessons = course.chapters.flatMap((chapter) => chapter.lessons);
    if (!lessons.length) return;

    const raw = progressQuery.data;
    const records: ProgressRecord[] = Array.isArray(raw)
      ? (raw as ProgressRecord[])
      : Array.isArray((raw as any)?.data)
        ? ((raw as any).data as ProgressRecord[])
        : [];
    const inProgress = records.find(
      (record) => record.status === 'in_progress' && (!record.courseId || record.courseId === course.id),
    );
    const routeLesson = routeLessonId && findLessonById(course.chapters, routeLessonId);
    const preferred = routeLesson || (inProgress && findLessonById(course.chapters, inProgress.lessonId));
    const firstAccessible = lessons.find((lesson) => lesson.isPreview) ?? lessons[0];
    const nextId = preferred?.id ?? firstAccessible.id;
    if (!routeLessonId) {
      navigate(`/dashboard/learning/${course.id}/lessons/${nextId}`, { replace: true });
    }
  }, [course, navigate, progressQuery.data, progressQuery.isLoading, routeLessonId]);

  // === 4) 标记完成 mutation ===
  const completeLessonMutation = useMutation({
    mutationFn: (lessonId: string) => progressApi.completeLesson(lessonId),
    onSuccess: async (data, lessonId) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-progress'] });
      queryClient.invalidateQueries({ queryKey: ['my-progress'] });
      // v1.4.1: 立刻上报 complete 事件(走 immediate 单条,不等 30s flush)
      // positionSec 由 VideoCenter 在切课时或刷新时上报,这里只标 complete
      learningEventsApi
        .createOne({
          eventType: 'complete',
          lessonId,
        })
        .catch(() => {
          /* noop */
        });
      // v1.9-alpha.2 (batch-7 A-04 + C-05): 课程刚完成 → 弹祝贺卡片。
      // 模板化文案, 不走 LLM; 证书数量 + 相似课推荐从现成 API 拼。
      if (data.courseJustCompleted) {
        try {
          const [myCerts, similarRes] = await Promise.all([
            certificatesApi.getMyCertificates().catch(() => [] as Certificate[]),
            api
              .get<
                Array<{
                  id: string;
                  title: string;
                  thumbnail: string;
                  level: string;
                  ratingAvg: number;
                  ratingCount: number;
                  score: number;
                }>
              >(`/api/v1/courses/${course.id}/similar?limit=2`)
              .catch(() => ({ data: [] })),
          ]);
          setCompletionCard({
            certificateCount: (myCerts ?? []).length,
            similar: (similarRes.data ?? []).map((s) => ({
              id: s.id,
              title: s.title,
              thumbnail: s.thumbnail,
              level: s.level,
              ratingAvg: s.ratingAvg,
              ratingCount: s.ratingCount,
            })),
          });
        } catch {
          // 卡片失败不影响标完成主流程
          setCompletionCard({ certificateCount: 0, similar: [] });
        }
      }
    },
    onError: (err) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? '标记课时完成失败,请重试';
      showToast(msg, 'error', 4000);
    },
  });

  // 章节切换时,切到 video tab(mobile)
  const handleSelectLesson = (lesson: Lesson) => {
    if (course) navigate(`/dashboard/learning/${course.id}/lessons/${lesson.id}`);
    setMobileTab('video');
  };

  // 上一节 / 下一节
  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!course) return;
    const allLessons = course.chapters.flatMap((c) => c.lessons);
    const idx = allLessons.findIndex((l) => l.id === currentLessonId);
    const target = direction === 'prev' ? allLessons[idx - 1] : allLessons[idx + 1];
    if (target) {
      navigate(`/dashboard/learning/${course.id}/lessons/${target.id}`);
    }
  };

  // === 加载 / 错误状态 ===
  const isInitialLoading = !!selectedCourseId && courseQuery.isLoading;

  // 任意一个核心 query 失败 → 走 QueryErrorState (不要错把"错"显示成"还没有可学习的课程"空态)
  const dashboardError =
    courseQuery.error || progressQuery.error;
  const dashboardRefetch = () => {
    courseQuery.refetch();
    progressQuery.refetch();
  };

  if (dashboardError && !isInitialLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <QueryErrorState
          error={dashboardError}
          onRetry={dashboardRefetch}
          title="无法加载学习中心"
          description="请检查网络后重试,或联系管理员"
        />
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] grid grid-cols-1 lg:grid-cols-[280px_1fr_360px] xl:grid-cols-[320px_1fr_400px] gap-px bg-neutral-200">
        <div className="bg-neutral-0 dark:bg-neutral-100 p-4 space-y-2">
          <Skeleton variant="text" className="h-4 w-1/2" />
          <Skeleton variant="text" count={8} />
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-50 p-4 space-y-3">
          <Skeleton variant="rectangle" className="aspect-video w-full" />
          <Skeleton variant="text" className="h-6 w-1/2" />
          <Skeleton variant="text" count={3} />
        </div>
        <div className="hidden lg:block bg-neutral-0 dark:bg-neutral-100 p-4 space-y-3">
          <Skeleton variant="circle" className="h-8 w-8" />
          <Skeleton variant="text" count={6} />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <EmptyState
          icon={<BookOpen className="w-5 h-5" />}
          title="还没有可学习的课程"
          description="先去课程大厅选一门课开始学习"
          action={
            <a
              href="/courses"
              className="inline-flex items-center gap-2 bg-[#171717] text-white px-4 py-2 text-sm font-medium rounded-md hover:bg-[#262626]"
            >
              浏览课程 <ArrowRight className="w-4 h-4" />
            </a>
          }
        />
      </div>
    );
  }

  if (routeLessonId && !findLessonById(course.chapters, routeLessonId)) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-semibold">找不到这个课时</h1>
          <p className="mt-2 text-sm text-neutral-600">它不属于当前课程，或已经不可用。</p>
          <Button className="mt-5" onClick={() => navigate('/dashboard')}>返回学习首页</Button>
        </div>
      </div>
    );
  }

  const currentLesson = findLessonById(course.chapters, currentLessonId) || course.chapters[0].lessons[0];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden">
      {/* ============================================================
       * 移动端 3 tab(< md)
       * ============================================================ */}
      <LearningWorkspace
        tabs={[{ id: 'outline', label: '目录', panelId: 'platform-outline-panel' }, { id: 'video', label: '学习', panelId: 'platform-video-panel' }, { id: 'ai', label: '导师', panelId: 'platform-ai-panel' }]}
        activeTab={mobileTab}
        onTabChange={(id) => setMobileTab(id as typeof mobileTab)}
        outline={<ChapterOutline chapters={course.chapters} completedSet={completedSet} currentLessonId={currentLessonId} inProgressLessonId={inProgressLessonId} onSelect={handleSelectLesson} />}
        content={<VideoCenter course={course} currentLesson={currentLesson} completedSet={completedSet} onMarkComplete={(id) => completeLessonMutation.mutate(id)} onNavigate={handleNavigate} isCompleting={completeLessonMutation.isPending} />}
        assistant={<AiAssistant courseId={course.id} courseTitle={course.title} currentLessonId={currentLesson.id} currentLessonTitle={currentLesson.title} resourceCount={currentLesson.resources?.length ?? 0} />}
      />

      {/* ============================================================
       * tablet 专属：课程导师 FAB（md 至 xl）
       * 浮动在右下角,点击展开抽屉(占 md 区域右侧 ~360px)
       * ============================================================ */}
      <button
        onClick={() => setAiDrawerOpen(true)}
        className="fixed bottom-24 right-4 z-30 hidden h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#171717] to-[#262626] text-white transition-all hover:scale-105 md:flex xl:hidden"
        aria-label="打开课程导师"
      >
        <Sparkles className="w-5 h-5" />
      </button>

      {/* tablet AI 抽屉 */}
      <PlatformAssistantDrawer
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        courseId={course.id}
        courseTitle={course.title}
        lesson={currentLesson}
      />

      {/* v1.9-alpha.2 (batch-7 C-05): 完成祝贺卡片 — 模板化文案 + 证书数 + 相似课。 */}
      {completionCard && (
        <CompletionCard
          courseTitle={course.title}
          certificateCount={completionCard.certificateCount}
          similar={completionCard.similar}
          onClose={() => setCompletionCard(null)}
        />
      )}
    </div>
  );
}

// v1.9-alpha.2 (batch-7 C-05): 完成卡片 — 不用 LLM, 模板文案.
function CompletionCard({
  courseTitle,
  certificateCount,
  similar,
  onClose,
}: {
  courseTitle: string;
  certificateCount: number;
  similar: Array<{
    id: string;
    title: string;
    thumbnail: string;
    level: string;
    ratingAvg: number;
    ratingCount: number;
  }>;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="课程完成"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-neutral-900/60 px-4"
    >
      <div className="max-w-md w-full rounded-xl bg-neutral-0 dark:bg-neutral-100 p-6 shadow-2xl">
        <h2 className="text-xl font-bold mb-2">恭喜完成《{courseTitle}》🎉</h2>
        <p className="text-sm text-neutral-700 mb-4">
          这是你的第 <strong>{certificateCount}</strong> 张证书。
          <a
            href="/dashboard/certificates"
            className="ml-1 underline text-[#171717]"
          >
            查看证书 →
          </a>
        </p>
        {similar.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-2">
              下一步推荐
            </p>
            <div className="grid grid-cols-2 gap-2">
              {similar.map((s) => (
                <a
                  key={s.id}
                  href={`/dashboard/learning/${s.id}`}
                  className="block rounded-md border border-neutral-200 p-2 hover:border-[#171717] transition-colors"
                >
                  <div className="text-xs font-medium line-clamp-2 mb-1">{s.title}</div>
                  <div className="text-[10px] text-neutral-600">
                    {s.ratingCount > 0
                      ? `★ ${s.ratingAvg.toFixed(1)} (${s.ratingCount})`
                      : '新课程'}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 h-10 rounded-md bg-[#171717] text-neutral-0 text-sm font-medium hover:bg-[#262626]"
        >
          继续探索
        </button>
      </div>
    </div>
  );
}
