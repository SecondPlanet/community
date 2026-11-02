/**
 * DashboardLayout — P0-6 学习中心布局
 *
 * 顶部 nav:在 P0-5 Layout 基础上裁剪,只保留:
 *   - 返回课程列表(左)
 *   - 课程名 + 进度条(中,flex-1,sm+ 才显示进度条)
 *   - 主题切换(右,所有断点)
 *
 * 故意**不**包含:
 *   - 主导航链接(课程/学位/黑客松) — dashboard 是 full-screen 沉浸式
 *   - mobile bottom tab — dashboard 是全屏学习体验,不适合弹 tab
 *   - FAB — 桌面 layout 的 FAB 是用来跳 /dashboard/learning 的;在 dashboard 内
 *     自身有 AI 助教右栏,不再需要 FAB
 *
 * 响应式:
 *   - < sm: 顶栏简化(只返回 + 课程名 + 主题)
 *   - sm+: 加进度条 + 学员信息(积分/等级)
 */
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Sparkles, Sun, Moon, Bell, ShoppingBag, Settings2 } from 'lucide-react';
import { Suspense, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme, useThemeStore } from '../../stores/themeStore';
import { IconButton } from '../../components/ui/IconButton';
import { pointsApi } from '../../lib/pointsApi';
import { progressApi } from '../../lib/progressApi';
import { useAuthStore } from '../../stores/authStore';
import api from '../../lib/api';
import { usePageSettings, useI18n, pickPage } from '../../lib/cms';

// P1-2 修复:不再用 useDashboardTheme 独立复刻,改用全局 themeStore
// 跟 Layout / AdminDashboardPage 共享同一份状态,icon 切换跟实际 class 永远一致
// 旧 useDashboardTheme 已删除(重构为 zustand)

export function DashboardLayout() {
  const theme = useTheme();
  const toggleTheme = useThemeStore((s) => s.toggle);
  const location = useLocation();
  const params = useParams<{ courseId?: string }>();
  const user = useAuthStore((s) => s.user);

  // 当前激活的路径(`/dashboard` 还是 `/dashboard/learning` 等),用于面包屑逻辑
  const onLearning = location.pathname.includes('/learning');

  // 课程名: 优先用 URL 的 courseId 拿, 否则拉最近一个 enrollment
  const { data: courseFromUrl, error: courseFromUrlError } = useQuery({
    queryKey: ['course', params.courseId],
    queryFn: async () => {
      if (!params.courseId) return null;
      const { data } = await api.get<{ id: string; title: string }>(`/api/v1/courses/${params.courseId}`);
      return data;
    },
    enabled: !!params.courseId,
    staleTime: 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (courseFromUrlError) {
      // eslint-disable-next-line no-console
      console.warn('[DashboardLayout] courseFromUrl failed:', courseFromUrlError);
    }
  }, [courseFromUrlError]);

  const { data: myEnrollments, error: enrollmentsError } = useQuery({
    queryKey: ['home', 'my-enrollment', user?.id],
    queryFn: async () => {
      const { data } = await api.get<Array<{ course: { id: string; title: string } | null }>>(
        '/api/v1/enrollments/me',
      );
      return data;
    },
    enabled: !!user && !params.courseId,
    staleTime: 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (enrollmentsError) {
      // eslint-disable-next-line no-console
      console.warn('[DashboardLayout] myEnrollments failed:', enrollmentsError);
    }
  }, [enrollmentsError]);

  // 课程进度: 来自 progressApi (只在选了课的 context 用)
  const { data: courseProgress, error: courseProgressError } = useQuery({
    queryKey: ['progress', 'course', params.courseId, user?.id],
    queryFn: () => progressApi.getCourseProgress(params.courseId!),
    enabled: !!user && !!params.courseId,
    staleTime: 30_000,
    retry: 1,
  });
  useEffect(() => {
    if (courseProgressError) {
      // eslint-disable-next-line no-console
      console.warn('[DashboardLayout] courseProgress failed:', courseProgressError);
    }
  }, [courseProgressError]);

  // 积分 + 等级
  const { data: userPoints, error: userPointsError } = useQuery({
    queryKey: ['points', 'me', user?.id],
    queryFn: () => pointsApi.getMyPoints(),
    enabled: !!user,
    staleTime: 30_000,
    retry: 1,
  });
  useEffect(() => {
    if (userPointsError) {
      // eslint-disable-next-line no-console
      console.warn('[DashboardLayout] userPoints failed:', userPointsError);
    }
  }, [userPointsError]);

  // 推导标题: 优先 URL > 最近 enrollment > 学习中心
  const courseTitle = courseFromUrl?.title
    ?? (myEnrollments?.[0]?.course?.title ?? null);
  const progressPercent = courseProgress?.percent ?? 0;

  // CMS-driven copy
  const { t } = useI18n();
  const { data: pageData } = usePageSettings('dashboard', ['layout.my_learning', 'layout.no_enrollment', 'layout.learning_center']);
  const myLearning = pickPage(pageData, 'layout.my_learning', 'zh-CN', t('dashboard.layout.my_learning', '我的学习 · 继续上次'));
  const noEnrollment = pickPage(pageData, 'layout.no_enrollment', 'zh-CN', t('dashboard.layout.no_enrollment', '选课开始学习'));
  const learningCenter = pickPage(pageData, 'layout.learning_center', 'zh-CN', t('dashboard.layout.learning_center', '学习中心'));

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans dark:bg-neutral-950 dark:text-neutral-900 flex flex-col">
      {/* ============================================================
       * 顶部 nav(全屏,sticky)
       * ============================================================ */}
      <header className="sticky top-0 z-50 bg-neutral-0/95 backdrop-blur-md border-b border-neutral-200 dark:bg-neutral-100/95 dark:border-neutral-200">
        <div className="px-4 sm:px-6 h-14 flex items-center gap-4">
          {/* 返回按钮 */}
          <Link
            to="/courses"
            className="flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-[#171717] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.back_to_courses', '返回课程')}</span>
          </Link>

          {/* 中:课程名 + 进度条 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-600 truncate">
              <GraduationCap className="w-3.5 h-3.5 shrink-0 text-[#171717]" />
              <span className="truncate font-medium">
                {onLearning
                  ? myLearning
                  : courseTitle
                  ? courseTitle
                  : user
                  ? noEnrollment
                  : learningCenter}
              </span>
            </div>
            {/* 进度条只在 sm+ 显示 */}
            <div className="hidden sm:block mt-1 h-1 rounded-full bg-neutral-200 dark:bg-neutral-200 overflow-hidden">
              <div
                className="h-full bg-[#171717] transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          </div>

          {/* 右:学员信息 + 主题切换 */}
          <div className="hidden md:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-xp-500">
              <span>⚡</span>
              <span className="font-mono font-medium">
                {userPoints ? userPoints.points.toLocaleString() : '—'}
              </span>
              <span className="text-neutral-400">{t('dashboard.points.label', '积分')}</span>
            </div>
            <div className="flex items-center gap-1 text-cert-500">
              <span>🏆</span>
              <span className="font-mono font-medium">
                LV {userPoints?.level ?? '—'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[#171717]">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-neutral-600 dark:text-neutral-600">{t('dashboard.ai.label', 'AI 助手')}</span>
            </div>
          </div>

          {/* P1-8: Bell (通知) + Order (订单) 入口 (顶栏右侧) */}
          <Link
            to="/dashboard/notifications"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors text-neutral-900 dark:text-neutral-900"
            aria-label="通知中心"
            title="通知中心"
          >
            <Bell className="w-5 h-5" />
          </Link>
          <Link
            to="/dashboard/orders"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors text-neutral-900 dark:text-neutral-900"
            aria-label="我的订单"
            title="我的订单"
          >
            <ShoppingBag className="w-5 h-5" />
          </Link>
          <Link to="/dashboard/settings/ai" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-neutral-100 transition-colors" aria-label="AI 助手设置" title="AI 助手设置">
            <Settings2 className="w-5 h-5" />
          </Link>

          {/* 主题切换 */}
          <IconButton
            variant="default"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? '切换为亮色' : '切换为暗色'}
            title={theme === 'dark' ? '切换为亮色' : '切换为暗色'}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </IconButton>
        </div>
      </header>

      {/* ============================================================
       * 主区域 — 渲染子路由(<Outlet />)
       * dashboard 页面会用 calc(100vh - 3.5rem) 控制三栏 fill 高度
       * ============================================================ */}
      <Suspense fallback={<DashboardFallback />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

// Dashboard 内 React.lazy() 路由的 fallback — 三栏布局的中部主区
// 保持 fill 高度,避免回流抖动
function DashboardFallback() {
  return (
    <div
      role="status"
      aria-label="加载中"
      className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-500"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#171717] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">加载中…</span>
      </div>
    </div>
  );
}
