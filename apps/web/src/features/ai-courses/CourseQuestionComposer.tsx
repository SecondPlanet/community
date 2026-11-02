import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Clock3, Settings2, Sparkles } from 'lucide-react';
import type {
  CreateLearningProjectInput,
  LearningPreferences,
} from './aiCourses.types';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { CountdownChip } from '../../components/CountdownChip';

const GOALS = [
  { value: 'quick_understanding', label: '快速理解' },
  { value: 'systematic', label: '系统学习' },
  { value: 'project', label: '项目实战' },
  { value: 'exam', label: '考试复习' },
] as const;

const EXAMPLES = [
  '用直觉和案例讲清楚 Transformer 为什么有效',
  '从零学习财务报表，并能分析一家真实公司',
  '为我设计一门 7 天掌握 RAG 工程实践的课程',
];

interface Props {
  compact?: boolean;
  initialQuestion?: string;
  submitting?: boolean;
  error?: string | null;
  errorActionHref?: string;
  retryAt?: Date | null;
  onRetryReady?: () => void;
  onSubmit(input: CreateLearningProjectInput): void;
}

const DRAFT_KEY = 'aicourse.draftQuestion';

// UX-AUDIT-2026-09-11 C-25: 用户写到一半误关页/网络断,刷新后草稿还在。
// ponytail: 用 sessionStorage(关 tab 自动清)而不是 localStorage,避免跨会话泄漏。
function loadDraft(initial: string): string {
  try {
    const stored = sessionStorage.getItem(DRAFT_KEY);
    return stored ?? initial;
  } catch {
    return initial;
  }
}

export function CourseQuestionComposer({
  compact = false,
  initialQuestion = '',
  submitting = false,
  error,
  errorActionHref,
  retryAt,
  onRetryReady,
  onSubmit,
}: Props) {
  const [question, setQuestion] = useState(() => loadDraft(initialQuestion));
  // UX-AUDIT-2026-09-11 C-23: 用户粘贴超 500 字时,把截掉的字数显示出来
  const [truncatedBy, setTruncatedBy] = useState(0);
  const [goalType, setGoalType] = useState<CreateLearningProjectInput['goalType']>('systematic');
  const [targetLevel, setTargetLevel] = useState<CreateLearningProjectInput['targetLevel']>('Beginner');
  const [availableMinutes, setAvailableMinutes] = useState(120);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<LearningPreferences>({
    explanationStyle: 'balanced',
    depth: 'standard',
    goalType: 'systematic',
    language: 'zh-CN',
    includeMath: true,
    includeCode: true,
  });
  const errorRef = useRef<HTMLDivElement>(null);
  const remaining = 500 - question.length;
  const isValid = question.trim().length > 0 && question.trim().length <= 500;
  const describedBy = error ? 'course-question-error course-question-count' : 'course-question-count';
  const submitLabel = compact ? '生成我的课程' : '开始设计课程';

  const payload = useMemo<CreateLearningProjectInput>(() => ({
    question: question.trim(),
    goalType,
    targetLevel,
    availableMinutes,
    preferences: { ...preferences, goalType },
  }), [availableMinutes, goalType, preferences, question, targetLevel]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // UX-AUDIT-2026-09-11 C-25: 草稿同步到 sessionStorage,关 tab 自动清。
  useEffect(() => {
    try {
      if (question) sessionStorage.setItem(DRAFT_KEY, question);
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore quota / privacy mode
    }
  }, [question]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (isValid && !submitting) {
          // UX-AUDIT-2026-09-11 C-25: 提交成功 → 清草稿,下次进入是空白。
          try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
          onSubmit(payload);
        }
      }}
      className={cn(
        'rounded-[28px] border border-neutral-200 bg-neutral-0 shadow-[0_24px_80px_rgba(23,23,23,0.08)]',
        compact ? 'p-5 md:p-7' : 'p-6 md:p-9',
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-600">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        课程工坊
      </div>
      <label htmlFor="course-question" className="mt-4 block text-xl font-semibold text-neutral-950 md:text-2xl">
        你真正想学会什么？
      </label>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
        可以是一道问题、一本书或一个主题。AI 会先设计可编辑的课程蓝图，经你确认后再逐节生成讲义。
      </p>

      <div className="mt-5 rounded-2xl border border-neutral-200 bg-[#F7F6F2] p-1 focus-within:border-neutral-950 focus-within:ring-4 focus-within:ring-neutral-950/5 dark:bg-neutral-200">
        <textarea
          id="course-question"
          value={question}
          onChange={(event) => {
            // UX-AUDIT-2026-09-11 C-23: 之前 slice(0,500) 静默截断,粘贴 600 字
            // 只剩前 500,用户不知情,isValid 永远为真。改为 onChange 时检测,
            // 超长 → 截断并把截掉的字数显示出来,让用户知道发生了什么。
            const next = event.target.value;
            if (next.length > 500) {
              setQuestion(next.slice(0, 500));
              setTruncatedBy(next.length - 500);
            } else {
              setQuestion(next);
              setTruncatedBy(0);
            }
          }}
          rows={compact ? 3 : 5}
          placeholder="例如：我读过《思考，快与慢》，但仍不理解认知偏差如何影响投资决策……"
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          className="w-full resize-none rounded-xl bg-transparent px-4 py-4 text-base leading-7 text-neutral-950 outline-none placeholder:text-neutral-400 md:text-lg"
        />
        <div className="flex items-center justify-between px-4 pb-3 text-xs text-neutral-500">
          <span>
            描述你的目标、已有基础或希望解决的具体困惑
            {truncatedBy > 0 && (
              <span className="ml-2 font-semibold text-amber-700" role="status">
                已截断 {truncatedBy} 字
              </span>
            )}
          </span>
          <span id="course-question-count" className={remaining < 40 ? 'text-amber-700' : undefined}>{remaining}</span>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="示例问题">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuestion(example)}
              className="rounded-full border border-neutral-200 px-3 py-2 text-left text-xs text-neutral-600 transition hover:border-neutral-950 hover:text-neutral-950"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <fieldset className="mt-6">
        <legend className="text-sm font-medium text-neutral-900">学习方式</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {GOALS.map((goal) => (
            <button
              key={goal.value}
              type="button"
              aria-pressed={goalType === goal.value}
              onClick={() => setGoalType(goal.value)}
              className={cn(
                'min-h-11 rounded-xl border px-3 text-sm transition',
                goalType === goal.value
                  ? 'border-neutral-950 bg-neutral-950 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 dark:text-neutral-800',
              )}
            >
              {goal.label}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => setShowPreferences((value) => !value)}
        aria-expanded={showPreferences}
        className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-950 dark:text-neutral-800"
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
        调整难度、时长与讲解风格
      </button>

      {showPreferences && (
        <div className="mt-3 grid gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 md:grid-cols-3">
          <label className="text-sm font-medium text-neutral-800">
            当前水平
            <select
              value={targetLevel}
              onChange={(event) => setTargetLevel(event.target.value as CreateLearningProjectInput['targetLevel'])}
              className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"
            >
              <option value="Beginner">刚接触</option>
              <option value="Intermediate">有一些基础</option>
              <option value="Advanced">希望深入</option>
              <option value="Expert">专业研究</option>
            </select>
          </label>
          <label className="text-sm font-medium text-neutral-800">
            预计总时长
            <select
              value={availableMinutes}
              onChange={(event) => setAvailableMinutes(Number(event.target.value))}
              className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"
            >
              <option value={30}>30 分钟</option>
              <option value={60}>1 小时</option>
              <option value={120}>2 小时</option>
              <option value={300}>5 小时</option>
              <option value={600}>10 小时</option>
            </select>
          </label>
          <label className="text-sm font-medium text-neutral-800">
            内容深度
            <select
              value={preferences.depth}
              onChange={(event) => setPreferences((value) => ({
                ...value,
                depth: event.target.value as LearningPreferences['depth'],
              }))}
              className="mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"
            >
              <option value="introductory">入门直觉</option>
              <option value="standard">平衡讲解</option>
              <option value="deep">深度推导</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-700 dark:text-neutral-800">
            <input
              type="checkbox"
              checked={preferences.includeCode}
              onChange={(event) => setPreferences((value) => ({ ...value, includeCode: event.target.checked }))}
              className="h-4 w-4"
            />
            需要代码示例
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-700 dark:text-neutral-800">
            <input
              type="checkbox"
              checked={preferences.includeMath}
              onChange={(event) => setPreferences((value) => ({ ...value, includeMath: event.target.checked }))}
              className="h-4 w-4"
            />
            保留数学推导
          </label>
        </div>
      )}

      {error && <div ref={errorRef} id="course-question-error" role="alert" tabIndex={-1} className="mt-4 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-danger-500 text-sm text-danger-500"><p>{error}</p>{retryAt && <CountdownChip target={retryAt} prefix="可重试" onExpire={onRetryReady} className="mt-2" />}{errorActionHref && <a href={errorActionHref} className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">反馈这个限制</a>}</div>}

      {/*
        v1.9-alpha.1 (A-12): 移动端 fixed/sticky 避开 Layout 底部 5 宫格 nav (z-50,
        ~4rem + safe-area)。interactive-widget=resizes-content (index.html) 让
        iOS Safari / Chrome 108+ 键盘弹起时布局视口缩小,sticky 元素跟着上移,
        不再被键盘盖住。compact 模式用 p-5/p-7,负 margin / 内 padding 同步切换,
        不越出卡片圆角。sm 以上恢复原静态布局。
      */}
      <div
        className={cn(
          'mt-6 flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center sm:justify-between',
          compact
            ? 'sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-5 bg-neutral-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 md:-mx-7 md:px-7'
            : 'sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-6 bg-neutral-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 md:-mx-9 md:px-9',
        )}
      >
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5"><BookOpen className="h-4 w-4" />先审蓝图</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />逐节生成</span>
        </div>
        <Button
          type="submit"
          size="lg"
          disabled={!isValid}
          isLoading={submitting}
          rightIcon={<ArrowRight className="h-4 w-4" />}
          className="sm:min-w-44"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
