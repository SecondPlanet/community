/**
 * /__design-system — 设计系统 demo 路由
 *
 * 渲染 5 个基础组件各 2-3 个变体 + 顶部 light/dark toggle +
 * 响应式 grid(mobile 1 列 / tablet 2 / desktop 3)。
 *
 * 临时挂载,后续 worktree 跑完移除。
 */
import { useEffect, useState } from 'react';
import {
  Search,
  Mail,
  Lock,
  Inbox,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';

type Theme = 'light' | 'dark';

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, setTheme];
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-xl p-6',
        'bg-neutral-0 dark:bg-neutral-100',
        'border border-neutral-200',
      )}
    >
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-900">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-600">
            {description}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  const [theme, setTheme] = useTheme();
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | undefined>(undefined);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-900">
      {/* 顶部 */}
      <header
        className={cn(
          'sticky top-0 z-50 backdrop-blur-md',
          'bg-neutral-50/80 dark:bg-neutral-950/80',
          'border-b border-neutral-200',
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#171717] flex items-center justify-center text-neutral-0 font-bold text-sm">
              D
            </div>
            <span className="font-semibold text-lg">
              Design System <span className="text-[#171717]">v1</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium',
              'bg-neutral-100 text-neutral-900 hover:bg-neutral-200',
              'dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200',
            )}
            aria-label="切换主题"
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-900">
            P0-4 设计系统演示
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-600">
            5 个基础组件 · 暗色/亮色/响应式 · shadow-glow 在主 CTA hover 时验证
          </p>
        </div>

        {/* 响应式 grid:1 / 2 / 3 列 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Button */}
          <Section
            title="Button"
            description="primary / secondary / ghost / danger × sm / md / lg"
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
                  Primary sm
                </Button>
                <Button variant="primary" size="md">
                  Primary md
                </Button>
                <Button variant="primary" size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Primary lg
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="md">
                  Secondary
                </Button>
                <Button variant="ghost" size="md">
                  Ghost
                </Button>
                <Button variant="danger" size="md">
                  Danger
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" isLoading size="md">
                  Loading
                </Button>
                <Button variant="primary" disabled size="md">
                  Disabled
                </Button>
                <Button variant="primary" fullWidth size="md">
                  Full width
                </Button>
              </div>
            </div>
          </Section>

          {/* Input */}
          <Section title="Input" description="label / hint / error / icons · forwardRef">
            <div className="flex flex-col gap-4">
              <Input
                label="邮箱"
                placeholder="you@example.com"
                leftIcon={<Mail className="h-4 w-4" />}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (e.target.value.includes('@')) setInputError(undefined);
                  else setInputError('请输入有效邮箱');
                }}
                error={inputError}
                required
              />
              <Input
                label="密码"
                type="password"
                placeholder="至少 8 位"
                leftIcon={<Lock className="h-4 w-4" />}
                hint="必须包含字母和数字"
              />
              <Input label="搜索" placeholder="搜索课程" leftIcon={<Search className="h-4 w-4" />} />
              <Input label="禁用状态" placeholder="不可编辑" disabled />
            </div>
          </Section>

          {/* Card */}
          <Section title="Card" description="default / elevated / outlined × hoverable">
            <div className="flex flex-col gap-3">
              <Card variant="default" padding="md">
                <div className="text-sm font-medium">Default</div>
                <div className="text-xs text-neutral-600 mt-1">shadow-sm + 细描边</div>
              </Card>
              <Card variant="elevated" padding="md">
                <div className="text-sm font-medium">Elevated</div>
                <div className="text-xs text-neutral-600 mt-1">shadow-md</div>
              </Card>
              <Card variant="outlined" padding="md" hoverable>
                <div className="text-sm font-medium">Outlined + Hoverable</div>
                <div className="text-xs text-neutral-600 mt-1">hover 升级到 shadow-md</div>
              </Card>
            </div>
          </Section>

          {/* EmptyState */}
          <Section title="EmptyState" description="全站空态统一组件">
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title="暂无课程"
              description="试试调整筛选条件,或清空搜索关键词,看看其他推荐课程。"
              action={<Button variant="primary" size="sm">浏览全部课程</Button>}
            />
          </Section>

          {/* Skeleton */}
          <Section title="Skeleton" description="text 多行 / circle / rectangle">
            <div className="flex flex-col gap-4">
              <Skeleton variant="text" count={3} />
              <div className="flex items-center gap-3">
                <Skeleton variant="circle" className="h-10 w-10" />
                <div className="flex-1 flex flex-col gap-2">
                  <Skeleton variant="text" />
                  <Skeleton variant="text" className="w-1/2" />
                </div>
              </div>
              <Skeleton variant="rectangle" className="h-24 w-full" />
            </div>
          </Section>

          {/* Token 展示 */}
          <Section title="Tokens" description="spec §2.1 / §2.2 色板 + 语义色">
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-xs text-neutral-600 mb-1.5">brand</div>
                <div className="flex gap-1">
                  {(['50', '100', '300', '500', '700', '900'] as const).map((k) => (
                    <div
                      key={k}
                      className={cn(
                        'h-8 w-8 rounded-md',
                        k === '500' && 'shadow-glow',
                      )}
                      style={{ backgroundColor: `var(--brand-${k})` }}
                      title={`brand-${k}`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-600 mb-1.5">neutral</div>
                <div className="flex gap-1">
                  {(['0', '50', '100', '200', '400', '600', '800', '900', '950'] as const).map(
                    (k) => (
                      <div
                        key={k}
                        className="h-8 w-8 rounded-md border border-neutral-200"
                        style={{ backgroundColor: `var(--neutral-${k})` }}
                        title={`neutral-${k}`}
                      />
                    ),
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-600 mb-1.5">semantic</div>
                <div className="flex gap-1">
                  <div className="h-8 w-8 rounded-md" style={{ backgroundColor: 'var(--success-500)' }} title="success-500" />
                  <div className="h-8 w-8 rounded-md" style={{ backgroundColor: 'var(--warning-500)' }} title="warning-500" />
                  <div className="h-8 w-8 rounded-md" style={{ backgroundColor: 'var(--danger-500)' }} title="danger-500" />
                  <div className="h-8 w-8 rounded-md" style={{ backgroundColor: 'var(--info-500)' }} title="info-500" />
                  <div className="h-8 w-8 rounded-md" style={{ backgroundColor: 'var(--xp-500)' }} title="xp-500" />
                  <div className="h-8 w-8 rounded-md" style={{ backgroundColor: 'var(--cert-500)' }} title="cert-500" />
                </div>
              </div>
            </div>
          </Section>
        </div>

        <p className="text-xs text-neutral-600 text-center py-4">
          /__design-system · 临时路由 · 后续 worktree 跑完移除
        </p>
      </main>
    </div>
  );
}
