/**
 * AdminDashboardPage — P1-3 后台数据看板 (接真后端)
 *
 * GET /api/v1/admin/stats 返回:
 *   - 4 KPI(今日 GMV / 新增用户 / DAU / 订单总数)
 *   - 用户增长 30 天数据
 *   - 课程报名 Top 10
 *   - 学位完成率(从 totals.completionRate)
 *   - 待办计数
 *   - 系统状态(DB 状态 / API 版本)
 *
 * 4 个图表用纯 inline SVG 画(不引 recharts):
 *   - RevenueChart — 收入构成(按 costType 简化:全部 from 总订单)
 *   - UserGrowthChart — 用户增长 30 天折线
 *   - FunnelChart — 报名 / 完成 漏斗
 *   - DegreePieChart — 收入饼图
 *
 * 处理:
 *   - isLoading → Skeleton 4 个 KPI + 4 个图表
 *   - isError → QueryErrorState + 重试
 *   - 空数据 → "暂无数据" 占位
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sun,
  Moon,
  ScrollText,
  Megaphone,
  FilePlus2,
} from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';
import { QueryErrorState } from '../../components/QueryErrorState';
import { useTheme, useThemeStore } from '../../stores/themeStore';
import { adminApi, type AdminKpi } from '../../lib/adminApi';
import { useLocaleDate } from '../../hooks/useLocaleDate';
import { cn } from '../../lib/cn';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// Brutalist tone mapping:
//   - success / danger: 黑色实心(高对比,语义"已确认")
//   - warning / info:   白底黑边(语义"需关注/中性")
//   - neutral:          灰色
const TONE_DOT: Record<Tone, string> = {
  success: 'bg-[#171717]',
  warning: 'bg-white border border-[#171717]',
  danger: 'bg-[#171717]',
  info: 'bg-[#666666]',
  neutral: 'bg-[#A3A3A3]',
};

const TONE_CHIP: Record<Tone, string> = {
  success: 'bg-[#171717] text-white',
  warning: 'border border-[#171717] text-[#171717] bg-white',
  danger: 'bg-[#171717] text-white',
  info: 'border border-[#171717] text-[#171717] bg-white',
  neutral: 'border border-[#A3A3A3] text-[#666666] bg-white',
};

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-[#171717]',
  warning: 'text-[#171717]',
  danger: 'text-[#171717]',
  info: 'text-[#171717]',
  neutral: 'text-[#666666]',
};

// =============================================================
// 主页面
// =============================================================
export function AdminDashboardPage() {
  const theme = useTheme();
  const toggleTheme = useThemeStore((s) => s.toggle);
  const isDark = theme === 'dark';
  const { formatNumber } = useLocaleDate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats(),
    refetchInterval: 60_000, // 1 分钟自动刷新
  });

  return (
    <div className="space-y-6">
      {/* ─── 顶部 ─── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-2">
            / Admin · Dashboard
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">数据看板</h2>
          <p className="text-xs text-[#666666] mt-2">
            实时数据 · 自动每 60 秒刷新
            {data?.system.database === 'down' && (
              <span className="ml-2 text-[#171717] font-black uppercase tracking-widest">
                · DB 异常
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-[#171717] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest">
            实时数据
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? '切换为亮色' : '切换为暗色'}
            title={isDark ? '切换为亮色' : '切换为暗色'}
            className="px-4 py-2 border border-[#171717] text-[#171717] text-xs font-black uppercase tracking-widest hover:bg-[#EEEDE9] transition-colors inline-flex items-center gap-1.5"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? '浅色' : '深色'}
          </button>
        </div>
      </div>

      {/* ─── 错误态 ─── */}
      {isError && <QueryErrorState error={error} onRetry={refetch} />}

      {/* ─── 4 KPI 卡 ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border-2 border-[#171717] bg-white p-6">
                <Skeleton className="h-3 w-1/2 mb-3" />
                <Skeleton className="h-8 w-2/3 mb-2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))
          : data?.kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      {/* ─── 4 图表 2x2 ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading || !data ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            <RevenueChart
              totalGmv={Number(
                data.kpis.find((k) => k.label === '今日 GMV')?.value.replace(/[¥, ]/g, '') ?? '0',
              )}
            />
            <UserGrowthChart growth={data.userGrowth} />
            <FunnelChart
              active={data.totals.activeEnrollments}
              completed={data.totals.completedEnrollments}
            />
            <DegreePieChart topCourses={data.topCourses} />
          </>
        )}
      </div>

      {/* ─── 待办 + 系统状态 ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 待办 */}
        <div className="border-2 border-[#171717] bg-white p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest">待办事项</h3>
            <Link
              to="/admin/courses"
              className="text-[10px] font-black uppercase tracking-widest text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white px-1"
            >
              查看课程管理 →
            </Link>
          </div>
          {data && (
            <div className="space-y-2">
              <TodoItem
                href="/admin/courses"
                title="草稿课程待发布"
                sub={`共 ${data.todos.draftCourses} 门草稿, 需审核后发布`}
                chip={`${data.todos.draftCourses} 门`}
                chipTone={data.todos.draftCourses > 0 ? 'info' : 'success'}
                dot={data.todos.draftCourses > 0 ? 'info' : 'success'}
                icon={<FilePlus2 className="w-3.5 h-3.5" />}
              />
              <TodoItem
                href="/admin/hackathons"
                title="本周新发布黑客松"
                sub="查看时间线、状态、参赛队伍"
                chip="查看"
                chipTone="info"
                dot="info"
                icon={<Megaphone className="w-3.5 h-3.5" />}
              />
            </div>
          )}
        </div>

        {/* 系统状态 */}
        <div className="border-2 border-[#171717] bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest">系统状态</h3>
            <ScrollText className="w-4 h-4 text-[#A3A3A3]" />
          </div>
          {data && (
            <div className="space-y-3 text-sm">
              <SystemRow
                name="数据库"
                value={data.system.database === 'ok' ? '正常' : '异常'}
                tone={data.system.database === 'ok' ? 'success' : 'danger'}
                dot={data.system.database === 'ok' ? 'success' : 'danger'}
              />
              <SystemRow
                name="API 版本"
                value={data.system.apiVersion}
                tone="neutral"
                dot="success"
              />
              <SystemRow
                name="总用户"
                value={formatNumber(data.totals.users)}
                tone="neutral"
                dot="success"
              />
              <SystemRow
                name="总课程"
                value={formatNumber(data.totals.courses)}
                tone="neutral"
                dot="success"
              />
              <SystemRow
                name="报名完成率"
                value={`${data.totals.completionRate.toFixed(1)}%`}
                tone={data.totals.completionRate >= 50 ? 'success' : 'warning'}
                dot={data.totals.completionRate >= 50 ? 'success' : 'warning'}
              />
            </div>
          )}
          <Link
            to="/admin/courses"
            className="mt-4 block text-center text-[10px] font-black uppercase tracking-widest text-[#171717] underline underline-offset-2 hover:bg-[#171717] hover:text-white py-2 border border-[#171717]"
          >
            查看课程管理 →
          </Link>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// 子组件
// =============================================================
function KpiCard({ kpi }: { kpi: AdminKpi }) {
  return (
    <div className="border-2 border-[#171717] bg-white p-6">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-[#666666]">
        <span>{kpi.label}</span>
        {kpi.deltaTone === 'up' && (
          <span className="text-[#171717] flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" />
            {kpi.delta}
          </span>
        )}
        {kpi.deltaTone === 'down' && (
          <span className="text-[#171717] flex items-center gap-0.5">
            <TrendingDown className="w-3 h-3" />
            {kpi.delta}
          </span>
        )}
        {kpi.deltaTone === 'warning' && (
          <span className="text-[#171717] flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" />
            预算 {kpi.delta}
          </span>
        )}
      </div>
      <div className="mt-2 text-3xl font-black tracking-tighter text-[#171717] font-mono">
        {kpi.value}
      </div>
      <div className="mt-1 text-xs text-[#666666]">{kpi.sub}</div>
    </div>
  );
}

function TodoItem({
  href,
  title,
  sub,
  chip,
  chipTone,
  dot,
  icon,
}: {
  href: string;
  title: string;
  sub: string;
  chip: string;
  chipTone: Tone;
  dot: Tone;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-3 p-3 border border-[#171717] hover:bg-[#EEEDE9] transition-colors"
    >
      <span className="w-8 h-8 flex items-center justify-center border border-[#171717] bg-white">
        <span className={TONE_TEXT[dot]}>{icon}</span>
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-black tracking-tight text-[#171717] truncate">{title}</div>
        <div className="text-xs text-[#666666]">{sub}</div>
      </div>
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-widest',
          TONE_CHIP[chipTone],
        )}
      >
        {chip}
      </span>
    </Link>
  );
}

function SystemRow({
  name,
  value,
  tone,
  dot,
}: {
  name: string;
  value: string;
  tone: Tone;
  dot: Tone;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-[#171717]">
        <span className={cn('w-2 h-2', TONE_DOT[dot])} aria-hidden="true" />
        <span>{name}</span>
      </div>
      <span className={cn('font-mono text-xs font-black uppercase tracking-widest', TONE_TEXT[tone])}>
        {value}
      </span>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="border-2 border-[#171717] bg-white p-6">
      <Skeleton className="h-3 w-1/4 mb-3" />
      <Skeleton variant="rectangle" className="h-32 w-full" />
    </div>
  );
}

// =============================================================
// 4 图表(简化版)
// =============================================================
function RevenueChart({ totalGmv }: { totalGmv: number }) {
  const { formatCurrency } = useLocaleDate();
  return (
    <div className="border-2 border-[#171717] bg-white p-6">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
        / Revenue
      </div>
      <h3 className="text-xs font-black uppercase tracking-widest">今日收入</h3>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
        按订单状态分布
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-black tracking-tighter text-[#171717] font-mono">
            {formatCurrency(totalGmv)}
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
            今日已支付 GMV
          </div>
        </div>
        <div className="flex flex-col items-end justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
          <div className="flex items-center gap-2 text-[#171717]">
            <span className="w-2 h-2 bg-[#171717]" />
            <span>已支付</span>
          </div>
          <div className="flex items-center gap-2 text-[#666666]">
            <span className="w-2 h-2 border border-[#171717] bg-white" />
            <span>待支付</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserGrowthChart({ growth }: { growth: { date: string; count: number }[] }) {
  if (growth.length === 0) {
    return (
      <div className="border-2 border-[#171717] bg-white p-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
          / User Growth
        </div>
        <h3 className="text-xs font-black uppercase tracking-widest">用户增长(30 天)</h3>
        <p className="text-sm text-[#666666] mt-6 text-center">暂无新增用户</p>
      </div>
    );
  }
  const max = Math.max(...growth.map((g) => g.count), 1);
  return (
    <div className="border-2 border-[#171717] bg-white p-6">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
        / User Growth
      </div>
      <h3 className="text-xs font-black uppercase tracking-widest">用户增长(30 天)</h3>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
        共 {growth.reduce((s, g) => s + g.count, 0)} 人
      </p>
      <svg viewBox="0 0 300 100" className="mt-4 w-full h-32" preserveAspectRatio="none">
        {growth.map((g, i) => {
          const x = (i / Math.max(growth.length - 1, 1)) * 300;
          const h = (g.count / max) * 90;
          return (
            <rect
              key={g.date}
              x={x - 4}
              y={100 - h}
              width={8}
              height={h}
              fill="#171717"
              opacity={0.85}
            />
          );
        })}
      </svg>
    </div>
  );
}

function FunnelChart({ active, completed }: { active: number; completed: number }) {
  const { formatNumber } = useLocaleDate();
  const total = active + completed;
  const rate = total > 0 ? (completed / total) * 100 : 0;
  return (
    <div className="border-2 border-[#171717] bg-white p-6">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
        / Completion Funnel
      </div>
      <h3 className="text-xs font-black uppercase tracking-widest">报名完成率</h3>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
        {formatNumber(total)} 总报名
      </p>
      <div className="mt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#666666]">
            进行中
          </span>
          <span className="font-mono text-[#171717] font-black">{formatNumber(active)}</span>
        </div>
        <div className="h-3 bg-[#EEEDE9] overflow-hidden flex border border-[#171717]">
          <div className="h-full bg-[#171717]" style={{ width: `${rate}%` }} />
          <div className="h-full bg-white" style={{ width: `${100 - rate}%` }} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#666666]">
            已完成
          </span>
          <span className="font-mono text-[#171717] font-black">
            {formatNumber(completed)} ({rate.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

function DegreePieChart({
  topCourses,
}: {
  topCourses: { id: string; title: string; enrollmentCount: number }[];
}) {
  const { formatNumber } = useLocaleDate();
  const total = topCourses.reduce((s, c) => s + c.enrollmentCount, 0);
  if (total === 0) {
    return (
      <div className="border-2 border-[#171717] bg-white p-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
          / Top Courses
        </div>
        <h3 className="text-xs font-black uppercase tracking-widest">课程报名 Top</h3>
        <p className="text-sm text-[#666666] mt-6 text-center">暂无报名数据</p>
      </div>
    );
  }
  return (
    <div className="border-2 border-[#171717] bg-white p-6">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
        / Top Courses
      </div>
      <h3 className="text-xs font-black uppercase tracking-widest">
        课程报名 Top {topCourses.length}
      </h3>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
        共 {formatNumber(total)} 报名
      </p>
      <div className="mt-4 space-y-1.5 text-xs">
        {topCourses.slice(0, 5).map((c) => {
          const pct = (c.enrollmentCount / total) * 100;
          return (
            <div key={c.id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0 truncate text-[#171717]">{c.title}</div>
              <div className="w-20 h-1.5 bg-[#EEEDE9] overflow-hidden border border-[#171717]">
                <div className="h-full bg-[#171717]" style={{ width: `${pct}%` }} />
              </div>
              <div className="w-12 text-right font-mono text-[#666666] font-black">
                {c.enrollmentCount}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
