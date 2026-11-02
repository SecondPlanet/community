/**
 * CommandPalette — P1-2 全局 ⌘K 搜索弹层
 *
 * 行为:
 *   - open=true 时 mount
 *   - 顶部:大 input + kbd "ESC" hint
 *   - 中部:按 type 分组(课程 / 学位 / 黑客松 / 讲师),每组 max 4 条
 *   - 键盘 ↑↓ 在所有可见结果间切换,Enter 跳转,⌘+Enter 新窗口打开
 *   - 空查询:显示 "热门搜索" 4 chips
 *   - 加载:Skeleton (text count=3)
 *   - 0 结果:EmptyState ("没找到相关内容, 试试其他关键词")
 *   - 弹层 fadeIn 200ms + scale 0.95 → 1(纯 CSS transition,无 framer-motion)
 *
 * 响应式 3 断点(spec):
 *   - mobile (< 768px):全屏 modal
 *   - tablet (768-1024px):600×400 居中弹层
 *   - desktop (≥ 1024px):720×440 居中弹层
 *
 * 父组件用 <CommandPalette open onClose /> 挂载,内部管所有键盘 / focus。
 * 暴露 onSelect?可选,父可监听(目前父不需要)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, BookOpen, GraduationCap, Trophy, User as UserIcon, ArrowUpRight, X, Command } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';
import { cn } from '../lib/cn';
import { searchAll, groupResults, type SearchResult, type SearchResultType } from '../lib/searchApi';
import { useList, useI18n } from '../lib/cms';
import { useAuthStore } from '../stores/authStore';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

// 每个 type 的视觉元数据
const TYPE_META: Record<SearchResultType, { label: string; icon: typeof BookOpen; color: string }> = {
  course: { label: '课程', icon: BookOpen, color: 'text-[#171717]' },
  degree: { label: '学位', icon: GraduationCap, color: 'text-xp-500' },
  hackathon: { label: '黑客松', icon: Trophy, color: 'text-warning-500' },
  instructor: { label: '讲师', icon: UserIcon, color: 'text-info-500' },
};

const PER_GROUP_LIMIT = 4;
const RECENT_KEY = 'aicourse.recentSearches';
const RECENT_MAX = 5;

// ============================================================================
// v1.9-alpha.2 (batch-9 C-06): 静态命令数组 — ⌘K 输入 `>` 前缀只显示命令。
// 设计原则(plan §3.6):
//   - 静态声明;不做插件化 / 命令注册 schema。
//   - ⌘K 不直接执行高危 mutation(开关 kill switch 等),由页面兜底二次确认框。
//   - roles 过滤:仅向指定角色展示;不指定则所有登录用户可见。
// ============================================================================
type CommandRole = 'admin' | 'student' | 'any';

interface CommandItem {
  id: string;
  label: string;
  keywords?: string[];
  roles?: CommandRole[];
  run: (navigate: (path: string) => void, toggleTheme?: () => void) => void;
}

const toggleThemeFn = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark');
  try {
    localStorage.setItem('theme', root.classList.contains('dark') ? 'dark' : 'light');
  } catch {
    /* SSR / private mode — ignore */
  }
};

const COMMANDS: CommandItem[] = [
  // ---- 普通用户 ----
  { id: 'home', label: '返回首页', keywords: ['home', '首页'], run: (n) => n('/') },
  { id: 'learning', label: '我的学习', keywords: ['学习', 'progress', 'learning', 'my'], run: (n) => n('/dashboard/learning') },
  { id: 'certificates', label: '我的证书', keywords: ['证书', 'certificate'], run: (n) => n('/dashboard/certificates') },
  { id: 'orders', label: '我的订单', keywords: ['订单', 'order'], run: (n) => n('/dashboard/orders') },
  { id: 'ai-courses-new', label: '新建 AI 课程', keywords: ['ai', '个人课程', 'ai-course'], run: (n) => n('/ai-courses/new') },
  { id: 'theme', label: '切换深色模式', keywords: ['主题', '深色', 'theme', 'dark'], run: (_n, t) => t?.() },

  // ---- 仅 admin ----
  { id: 'admin-users', label: '用户管理 (admin)', roles: ['admin'], keywords: ['用户', 'user'], run: (n) => n('/admin/users') },
  { id: 'admin-courses', label: '课程管理 (admin)', roles: ['admin'], keywords: ['课程管理'], run: (n) => n('/admin/courses') },
  { id: 'admin-degrees', label: '学位管理 (admin)', roles: ['admin'], keywords: ['学位'], run: (n) => n('/admin/degrees') },
  { id: 'admin-hackathons', label: '黑客松管理 (admin)', roles: ['admin'], keywords: ['黑客松'], run: (n) => n('/admin/hackathons') },
  { id: 'admin-badges', label: '徽章管理 (admin)', roles: ['admin'], keywords: ['徽章', 'badge'], run: (n) => n('/admin/badges') },
  { id: 'admin-cms', label: 'CMS 列表 (admin)', roles: ['admin'], keywords: ['cms'], run: (n) => n('/admin/cms') },
];

/** 把 query 转成命令过滤参数;`>` 前缀去掉并仅匹配命令。 */
function filterCommands(query: string, role: CommandRole): CommandItem[] {
  const trimmed = query.trim();
  if (!trimmed.startsWith('>')) {
    // 无 `>` 前缀时,命令区只在用户输入与命令 label/keywords 有重叠时混入,
    // 避免空查询时被命令淹没(plan §3.6 "无前缀时命令和搜索结果混排")。
    // 这里简单实现:只要 query 非空,就把"教学相关"短命令全部展示当热启动。
    if (!trimmed) return [];
    const lc = trimmed.toLowerCase();
    return COMMANDS.filter(
      (c) =>
        (c.roles ?? ['any']).includes('any') &&
        (c.label.toLowerCase().includes(lc) ||
          (c.keywords ?? []).some((k) => k.toLowerCase().includes(lc))),
    );
  }
  // `> ` 或 `>xxx`
  const kw = trimmed.slice(1).trim().toLowerCase();
  return COMMANDS.filter((c) => {
    if (!(c.roles ?? ['any']).includes(role) && !(c.roles ?? ['any']).includes('any')) {
      return false;
    }
    if (!kw) return true; // `>` 单独输入,列出当前角色可见的所有命令
    return (
      c.label.toLowerCase().includes(kw) ||
      (c.keywords ?? []).some((k) => k.toLowerCase().includes(kw))
    );
  });
}

function loadRecent(): string[] {
  // ponytail: try/catch covers SSR + Safari private mode (QuotaError).
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  try {
    const next = [trimmed, ...loadRecent().filter((s) => s !== trimmed)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / privacy mode
  }
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  // UX-AUDIT-2026-09-11 C-26: ⌘K 历史。mount 时一次性拉,Enter 跳转时 push。
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // debounce 200ms(比 300ms 略快,Command-K 要即时感)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // 拉数据(用 react-query 自动管 dedupe / cache)
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchAll(debouncedQuery),
    // 空查询只展示热门词，不需要向四个搜索端点各发一次请求。
    // v1.9-alpha.2 (batch-9 C-06): `>` 前缀时只显示命令,不发搜索请求。
    enabled:
      open &&
      debouncedQuery.trim().length > 0 &&
      !debouncedQuery.trim().startsWith('>'),
    staleTime: 30_000,
  });

  // 热门搜索只来自 CMS/数据库；空表就不展示，不能伪造旧热词。
  const { data: hotData } = useList<{ keyword: string; isActive?: boolean }>('popular-searches');
  const hotSearches = useMemo(() => {
    return (hotData ?? []).filter((s) => s.isActive !== false).map((s) => s.keyword);
  }, [hotData]);

  // i18n
  const { t } = useI18n();

  // v1.9-alpha.2 (batch-9 C-06): 当前用户角色(用于过滤 admin 命令)
  const userRole = useAuthStore((s) => s.user?.role);
  const commandRole: CommandRole = userRole === 'admin' ? 'admin' : 'student';

  // v1.9-alpha.2 (batch-9 C-06): 命令区过滤结果(放搜索结果前)
  const matchedCommands = useMemo(
    () => filterCommands(debouncedQuery, commandRole),
    [debouncedQuery, commandRole],
  );

  // 拼出"扁平 + 分组"两份数据,给键盘导航 + 渲染共用
  // v1.9-alpha.2 (batch-9): 命令放在搜索结果前,Enter 优先匹配命令
  const groups = useMemo(() => {
    if (!data) return [];
    return groupResults(data.results).map((g) => ({
      ...g,
      items: g.items.slice(0, PER_GROUP_LIMIT),
    }));
  }, [data]);

  // flat 里命令是条目占位, 渲染走 `matchedCommands` + `flat` 各自的分支
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // 切换 query / 拉新数据 → 重置选中
  useEffect(() => {
    setSelectedIdx(0);
  }, [debouncedQuery]);

  // 打开时自动 focus input
  useEffect(() => {
    if (open) {
      // 微延迟,等 modal 动画完
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      // 关闭时清空 query,避免下次打开还残留
      setQuery('');
      setSelectedIdx(0);
    }
  }, [open]);

  // UX-AUDIT-2026-09-11 C-26: 每次打开重读一次,多设备/多 tab 同步看到最新。
  useEffect(() => {
    if (open) setRecentSearches(loadRecent());
  }, [open]);

  // v1.9-alpha.2 (batch-9 C-06): 键盘导航 + Enter 处理 — 命令在搜索结果前
  // flat = [...commands, ...searchResults]
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
      } else if (e.key === 'Enter') {
        // 命令模式(`>` 前缀) 不写最近搜索 — 那是导航动作, 不是搜索关键词
        if (!debouncedQuery.trim().startsWith('>')) {
          // UX-AUDIT-2026-09-11 C-26: Enter 即使用户提交也算"最近搜索",存盘前先 dedupe + cap。
          pushRecent(query);
          setRecentSearches(loadRecent());
        }
        const idx = selectedIdx;
        const cmd = matchedCommands[idx];
        if (cmd) {
          e.preventDefault();
          // v1.9-alpha.2 (batch-9): 命令执行 — ⌘+Enter 不开新窗, 直接执行
          cmd.run(navigate, toggleThemeFn);
          onClose();
          return;
        }
        const item = flat[idx - matchedCommands.length];
        if (!item) return;
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          window.open(item.href, '_blank', 'noopener,noreferrer');
        } else {
          navigate(item.href);
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, flat, matchedCommands, selectedIdx, navigate, debouncedQuery, query]);

  // 选中项 scroll into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (!open) return null;

  // 计算每个 item 在 flat 数组里的 idx
  // v1.9-alpha.2 (batch-9): 命令在前, 搜索结果的 idx 从 matchedCommands.length 起
let runningIdx = matchedCommands.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="全站搜索"
      onMouseDown={(e) => {
        // 点击 backdrop 关闭(mousedown 时机比 click 早,避免与 input focus 冲突)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-neutral-900/40 dark:bg-neutral-950/70 animate-[fadeIn_200ms_ease-out]"
        aria-hidden="true"
      />

      {/* 弹层本体 */}
      <div
        className={cn(
          'relative w-full',
          'h-[100dvh] sm:h-auto',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:pt-0 sm:pb-0',
          'sm:max-w-[600px] md:max-w-[600px] lg:max-w-[720px]',
          'sm:max-h-[400px] md:max-h-[400px] lg:max-h-[440px]',
          'bg-neutral-0 dark:bg-neutral-100',
          'rounded-none sm:rounded-xl',
          'border border-neutral-200',
          'shadow-lg',
          'flex flex-col overflow-hidden',
          'animate-[paletteIn_200ms_ease-out]',
        )}
      >
        {/* 顶部 input */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-neutral-200 shrink-0">
          <Search className="w-5 h-5 text-neutral-600 dark:text-neutral-600 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索或输入 > 快捷命令"
            className={cn(
              'flex-1 bg-transparent outline-none text-base sm:text-lg',
              'text-neutral-900 placeholder:text-neutral-400',
              'dark:text-neutral-900 dark:placeholder:text-neutral-600',
            )}
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            enterKeyHint="search"
            spellCheck={false}
            aria-label="搜索关键字"
          />
          <kbd
            className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono rounded border border-neutral-200 text-neutral-600 dark:text-neutral-600"
            aria-label="按 ESC 关闭"
          >
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="sm:hidden p-1 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-600 dark:text-neutral-600 hover:text-neutral-900 dark:hover:text-neutral-900"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 中部结果区 */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain"
        >
          {/* 加载状态 */}
          {(isLoading || isFetching) && debouncedQuery && (
            <div className="p-5 space-y-3">
              <Skeleton variant="text" count={3} />
            </div>
          )}

          {/* 空查询:最近搜索 + 热门搜索 chips */}
          {!debouncedQuery && (
            <div className="p-5 sm:p-6">
              {/* UX-AUDIT-2026-09-11 C-26: 最近 5 条,带清除按钮 */}
              {recentSearches.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-600">
                      最近搜索
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        try { localStorage.removeItem(RECENT_KEY); } catch {}
                        setRecentSearches([]);
                      }}
                      className="text-[10px] font-medium text-neutral-500 hover:text-neutral-900 underline-offset-2 hover:underline"
                    >
                      清除
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setQuery(r);
                          inputRef.current?.focus();
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-sm font-medium',
                          'bg-white dark:bg-neutral-0 border border-neutral-200',
                          'text-neutral-700 hover:border-neutral-950 hover:text-neutral-950',
                          'transition-colors',
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-600 mb-3">
                {t('common.search.hot', '热门搜索')}
              </div>
              <div className="flex flex-wrap gap-2">
                {hotSearches.map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setQuery(h);
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium',
                      'bg-neutral-100 dark:bg-neutral-100',
                      'text-neutral-900 dark:text-neutral-900',
                      'hover:bg-[#EEEDE9] dark:hover:bg-[#EEEDE9] hover:text-[#171717]',
                      'transition-colors',
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <div className="mt-6 text-xs text-neutral-600 dark:text-neutral-600 leading-relaxed">
                提示:用 <kbd className="px-1 py-0.5 text-[10px] font-mono rounded bg-neutral-100 dark:bg-neutral-100">↑</kbd>{' '}
                <kbd className="px-1 py-0.5 text-[10px] font-mono rounded bg-neutral-100 dark:bg-neutral-100">↓</kbd>{' '}
                切换, <kbd className="px-1 py-0.5 text-[10px] font-mono rounded bg-neutral-100 dark:bg-neutral-100">↵</kbd>{' '}
                跳转, <kbd className="px-1 py-0.5 text-[10px] font-mono rounded bg-neutral-100 dark:bg-neutral-100">⌘↵</kbd>{' '}
                新窗口打开
              </div>
              <div className="mt-3 text-xs text-neutral-600 dark:text-neutral-600">
                提示:输入 <kbd className="px-1 py-0.5 text-[10px] font-mono rounded bg-neutral-100 dark:bg-neutral-100">&gt;</kbd>{' '}
                查看快捷命令
              </div>
            </div>
          )}

          {/* v1.9-alpha.2 (batch-9 C-06): 命令组 — 始终放在搜索结果前 */}
          {matchedCommands.length > 0 && (
            <div className="py-2" data-testid="commands-section">
              <div className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-600 flex items-center gap-2">
                <Command className="w-3 h-3" />
                命令
                <span className="text-neutral-400">({matchedCommands.length})</span>
              </div>
              {matchedCommands.map((cmd, idx) => {
                const selected = idx === selectedIdx;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    data-idx={idx}
                    data-testid={`command-${cmd.id}`}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onClick={() => {
                      cmd.run(navigate, toggleThemeFn);
                      onClose();
                    }}
                    className={cn(
                      'w-full text-left px-5 py-2 flex items-center justify-between gap-2',
                      'transition-colors',
                      selected
                        ? 'bg-[#171717] text-white'
                        : 'text-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-200',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Command className="w-3.5 h-3.5 opacity-70" />
                      {cmd.label}
                    </span>
                    <ArrowUpRight
                      className={cn(
                        'w-3.5 h-3.5 shrink-0',
                        selected ? 'text-white/80' : 'text-neutral-400',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* 有结果:按 type 分组 */}
          {debouncedQuery && !isLoading && !isFetching && groups.some((g) => g.items.length > 0) && (
            <div className="py-2">
              {groups.map((g) => {
                if (g.items.length === 0) return null;
                const Icon = TYPE_META[g.type].icon;
                return (
                  <div key={g.type} className="mb-1">
                    <div className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-600 flex items-center gap-2">
                      <Icon className={cn('w-3 h-3', TYPE_META[g.type].color)} />
                      {TYPE_META[g.type].label}
                      <span className="text-neutral-400">({g.items.length})</span>
                    </div>
                    {g.items.map((item) => {
                      const idx = runningIdx++;
                      const selected = idx === selectedIdx;
                      return (
                        <ResultRow
                          key={`${g.type}-${item.id}`}
                          item={item}
                          selected={selected}
                          idx={idx}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          onClick={() => {
                            navigate(item.href);
                            onClose();
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* 0 结果 */}
          {debouncedQuery && !isLoading && !isFetching && flat.length === 0 && (
            <div className="p-5 sm:p-6">
              <EmptyState
                icon={<Search className="w-6 h-6" />}
                title="没找到相关内容"
                description="试试其他关键词,例如「LangChain」「RAG」「Agent」"
              />
            </div>
          )}

          {/* 部分端点失败提示 */}
          {data?.hasFailures && debouncedQuery && (
            <div className="px-5 py-2 text-[10px] text-warning-500 border-t border-neutral-200">
              部分搜索服务暂不可用,部分结果可能缺失
            </div>
          )}
        </div>

        {/* 底部:计数 + 键盘 hint(桌面) */}
        {flat.length > 0 && (
          <div className="hidden sm:flex items-center justify-between px-5 py-2 border-t border-neutral-200 text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-600 shrink-0">
            <span>
              {matchedCommands.length > 0
                ? `命令 ${matchedCommands.length} 条 · `
                : data?.counts
                  ? `共 ${data.counts.course + data.counts.degree + data.counts.hackathon + data.counts.instructor} 条`
                  : ''}
            </span>
            <span className="flex items-center gap-3">
              <span>
                <kbd className="font-mono">↵</kbd> {matchedCommands.length > 0 ? '执行命令' : '跳转'}
              </span>
              {matchedCommands.length === 0 && (
                <span>
                  <kbd className="font-mono">⌘↵</kbd> 新窗口
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* 注入 keyframes(纯 CSS,避免引 framer-motion) */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes paletteIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// 单个结果行
function ResultRow({
  item,
  selected,
  idx,
  onClick,
  onMouseEnter,
}: {
  item: SearchResult;
  selected: boolean;
  idx: number;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      data-idx={idx}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full text-left px-5 py-2.5 flex items-start gap-3',
        'transition-colors',
        selected
          ? 'bg-[#EEEDE9] dark:bg-[#171717]/30'
          : 'hover:bg-neutral-50 dark:hover:bg-neutral-100',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm text-neutral-900 dark:text-neutral-900 truncate">
            {item.title}
          </span>
          {item.badge && (
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-600 shrink-0">
              {item.badge}
            </span>
          )}
        </div>
        {item.subtitle && (
          <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-600 line-clamp-1">
            {item.subtitle}
          </p>
        )}
        {item.meta && (
          <p className="mt-0.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {item.meta}
          </p>
        )}
      </div>
      <ArrowUpRight
        className={cn(
          'w-4 h-4 mt-0.5 shrink-0 transition-opacity',
          selected ? 'opacity-100 text-[#171717]' : 'opacity-0 text-neutral-400',
        )}
        aria-hidden="true"
      />
    </button>
  );
}
