/**
 * Layout — P0-5 落地版
 *
 * 顶部 nav:沿用 P0-4 的结构(在 admin 入口前新增 theme toggle 按钮),
 * 不重写,只在 P0-4 基础上加 1 个按钮。
 *
 * 新增:
 *   - 右上角:theme toggle 按钮(☀️/🌙) — 切 <html class="dark"> + localStorage('theme')
 *   - 底部:全局 AI 助手 FAB（平板及桌面显示）
 *   - 移动端:5 宫格 bottom tab（首页/课程/学习/AI 助手/我的）
 *
 * 响应式:
 *   - < 768px (md-):bottom tab 显示，不重复显示 FAB
 *   - ≥ 768px (md+):bottom tab 隐藏,FAB 右下角
 *   - theme toggle:所有断点都显
 */
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Menu,
  User as UserIcon,
  LogOut,
  Settings,
  Sun,
  Moon,
  Sparkles,
  Home,
  BookOpen,
  Search,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useAuth } from '../lib/auth/AuthContext';
import { useTheme, useThemeStore } from '../stores/themeStore';
import { useWebAssistantStore } from '../stores/webAssistantStore';
import { cn } from '../lib/cn';
import { Skeleton } from './ui/Skeleton';
import { IconButton } from './ui/IconButton';
import { useList, useSiteSettings, pickSite, safeNavPath } from '../lib/cms';
import { filterAiCourseNavigation, useAiCourseCapability } from '../features/ai-courses/aiCourseCapability';

const CommandPalette = lazy(() =>
  import('./CommandPalette').then((module) => ({ default: module.CommandPalette })),
);
const WebAssistantDrawer = lazy(() =>
  import('./WebAssistant/WebAssistantDrawer').then((module) => ({ default: module.WebAssistantDrawer })),
);

// initThemeFromStorage 重新导出,保持 index.tsx 的导入路径不变
export { initThemeFromStorage } from '../stores/themeStore';

/**
 * useNavItems — 顶部导航项（CMS / 数据库驱动）
 */
function useNavItems(aiCoursesEnabled: boolean): Array<{ label: string; path: string }> {
  const { data } = useList<{ label: string; path: string; isActive?: boolean }>('top-nav');
  if (data && data.length > 0) {
    const hasAiCourseEntry = data.some((item) => safeNavPath(item.path) === '/ai-courses');
    const configured = data
      .filter((it) => it.isActive !== false)
      .map((it) => ({ label: it.label, path: safeNavPath(it.path) }))
      .filter((it) => it.path !== '#');
    // Existing deployments may have CMS navigation rows created before the
    // AI hub existed. Keep the new first-class entry visible until seed-cms
    // upserts it; an explicitly inactive CMS row is still respected.
    const withAiCourse = hasAiCourseEntry
      ? configured
      : [{ label: '课程工坊', path: '/ai-courses' }, ...configured];
    return filterAiCourseNavigation(withAiCourse, aiCoursesEnabled);
  }
  const defaults = [
    { label: '课程工坊', path: '/ai-courses' },
    { label: '课程', path: '/courses' },
    { label: '学位', path: '/degrees' },
    { label: '黑客松', path: '/hackathons' },
  ];
  return filterAiCourseNavigation(defaults, aiCoursesEnabled);
}

/**
 * useFooterColumns — footer 分栏（CMS / 数据库驱动）
 */
function useFooterColumns(aiCoursesEnabled: boolean): Array<{ title: string; links: Array<{ label: string; path: string }> }> {
  const { data } = useList<{ title: string; links: Array<{ label: string; path: string }>; isActive?: boolean }>('footer-columns');
  if (data && data.length > 0) {
    const configured = data
      .filter((c) => c.isActive !== false)
      .map((c) => ({
        title: c.title,
        links: (c.links ?? [])
          .map((l) => ({ label: l.label, path: safeNavPath(l.path) }))
          .filter((l) => l.path !== '#'),
      }));
    return configured.map((column) => ({
      ...column,
      links: filterAiCourseNavigation(column.links, aiCoursesEnabled),
    }));
  }
  return [
    {
      title: '学习',
      links: [
        { label: '课程', path: '/courses' },
        { label: '学位', path: '/degrees' },
        { label: '黑客松', path: '/hackathons' },
      ],
    },
    {
      title: '公司',
      links: [
        { label: 'GitHub 开源仓库', path: 'https://github.com/SecondPlanet/community' },
        { label: '关于我们', path: '/about' },
      ],
    },
    {
      title: '法律',
      links: [
        { label: '服务条款', path: '/terms' },
        { label: '隐私政策', path: '/privacy' },
        { label: 'Cookie 政策', path: '/cookies' },
        { label: '退款政策', path: '/refund' },
      ],
    },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const theme = useTheme();
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  // P1 fix: 走 signOut() (POST /auth/logout + 清 httpOnly cookie),不是只 clearAuth
  // 旧实现只清内存/sessionStorage,cookie 留着 → 刷新后 AuthProvider 探活又登录回来
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const openWebAssistant = useWebAssistantStore((s) => s.openDrawer);
  // 移动 tab "AI" 入口的 active 高亮(走 drawer.open 判定)
  const isAssistantOpen = useWebAssistantStore((s) => s.open);
  const aiCourseCapability = useAiCourseCapability();
  // Loading and errors fail closed so rollout links never flash before the
  // public capability (including runtime kill switch) is known.
  const aiCoursesEnabled = aiCourseCapability.data?.enabled === true;

  // P1-9+: 点 FAB / 移动 tab AI 入口:已登录 → 打开 drawer;未登录 → 跳登录
  // 携带 state.from 让 LoginPage 登录后能恢复意图 (UX-AUDIT-2026-09-11 C-08)
  const handleOpenWebAssistant = () => {
    if (!user) {
      navigate('/auth/login', { state: { from: 'web-assistant' } });
      return;
    }
    openWebAssistant();
  };

  // 全局 ⌘K / Ctrl+K 触发 CommandPalette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 路由切换时关闭移动端菜单 / 搜索弹层
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = useNavItems(aiCoursesEnabled);

  const handleLogout = async () => {
    // signOut 内部: await adapter.signOut() (POST /auth/logout 清 cookie) → setAccessToken(null) → clearAuth
    // await 让 logout 请求飞完再 navigate,否则 navigate 触发 unmount 会 cancel
    try {
      await signOut();
    } finally {
      // 即使服务端暂时不可用，也要清掉本地 AI 会话并离开私有页面。
      useAuthStore.getState().clearAuth();
      useWebAssistantStore.getState().reset();
      navigate('/');
    }
  };

  // mobile bottom tab 高亮判定
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-neutral-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))] font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-900 md:pb-0">
      {/* 跳到主内容: 键盘用户第一个 Tab 即可跳过导航 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-neutral-900 focus:text-white focus:text-xs focus:font-black focus:uppercase focus:tracking-widest"
      >
        跳到主内容
      </a>
      {/* ============================================================
       * 顶部 nav(P0-4 结构,只加 theme toggle 按钮)
       * ============================================================ */}
      <header className="sticky top-0 z-50 bg-neutral-50/95 backdrop-blur-md border-b border-neutral-200 dark:bg-neutral-950/95 dark:border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-black text-lg tracking-tighter">
            <span className="w-7 h-7 bg-[#171717] flex items-center justify-center text-white rounded-md">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="whitespace-nowrap text-[15px] uppercase text-neutral-900 dark:text-neutral-900 sm:text-lg">SecondPlanet</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1 text-sm font-bold">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive(item.path) ? 'page' : undefined}
                className="px-3 py-2 text-neutral-600 hover:text-[#171717] hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors uppercase tracking-wider text-[12px]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* P1-2: 顶部搜索框(md+ 显 / mobile 隐) — 点击 / focus 调出 CommandPalette */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            aria-label="打开搜索(⌘K)"
            className={cn(
              'hidden xl:flex items-center gap-2',
              'flex-1 max-w-md mx-4 h-9 px-3',
              'rounded-md border border-neutral-200',
              'bg-neutral-100 dark:bg-neutral-100',
              'text-neutral-600 dark:text-neutral-600',
              'hover:border-[#171717] hover:bg-neutral-0 dark:hover:bg-neutral-0',
              'transition-colors text-left text-sm',
            )}
          >
            <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">搜索课程 / 讲师 / 技能</span>
            <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded border border-neutral-200 text-neutral-600 dark:text-neutral-600">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-1">
            {user ? (
              <>
                {/* P1-3 修复:头像/名字 < sm 也显示(只显头像,名字 >= sm 显) */}
                <Link
                  to="/profile"
                  className="flex items-center gap-2 text-sm font-bold px-2 sm:px-3 py-2 min-h-[44px] hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors"
                  aria-label={`个人中心:${user.name}`}
                >
                  <div className="w-7 h-7 bg-[#171717] flex items-center justify-center text-white text-xs font-black rounded-md">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline text-neutral-900 dark:text-neutral-900">
                    {user.name}
                  </span>
                </Link>
                {user.role === 'admin' && (
                  <Link
                    to="/admin"
                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors text-neutral-900 dark:text-neutral-900"
                    title="管理后台"
                    aria-label="管理后台"
                  >
                    <Settings className="w-5 h-5" />
                  </Link>
                )}
                <IconButton
                  variant="default"
                  className="hidden sm:flex"
                  onClick={handleLogout}
                  title="退出登录"
                  aria-label="退出登录"
                >
                  <LogOut className="w-5 h-5" />
                </IconButton>
              </>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 text-xs sm:text-sm font-black uppercase tracking-wider bg-[#171717] text-white px-3 sm:px-4 py-2 min-h-[44px] hover:bg-[#262626] transition-colors rounded-md"
                aria-label="登录"
              >
                <UserIcon className="w-4 h-4" /> <span className="hidden xs:inline sm:hidden">登</span><span className="hidden sm:inline">登录</span>
              </Link>
            )}

            {/* P1-2: mobile 搜索图标按钮(md 以下点击也调出 CommandPalette) */}
            <IconButton
              variant="default"
              className="xl:hidden"
              onClick={() => setIsSearchOpen(true)}
              aria-label="打开搜索"
              title="搜索(⌘K)"
            >
              <Search className="w-5 h-5" />
            </IconButton>

            {/* P0-5 新增:theme toggle 按钮(admin 入口前) */}
            <IconButton
              variant="default"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? '切换为亮色' : '切换为暗色'}
              title={theme === 'dark' ? '切换为亮色' : '切换为暗色'}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </IconButton>

            <IconButton
              variant="default"
              className="lg:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="菜单"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-primary-menu"
            >
              <Menu className="w-5 h-5" />
            </IconButton>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div id="mobile-primary-menu" className="lg:hidden border-t border-neutral-200 bg-neutral-50 dark:bg-neutral-950">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive(item.path) ? 'page' : undefined}
                className="block px-6 py-3 text-sm font-bold uppercase tracking-wider text-neutral-600 hover:text-[#171717] hover:bg-neutral-100 dark:hover:bg-neutral-100 border-b border-neutral-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            {!user && (
              <Link
                to="/login"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-6 py-3 text-sm font-bold uppercase tracking-wider text-[#171717] hover:bg-neutral-100 dark:hover:bg-neutral-100 border-b border-neutral-200"
              >
                登录
              </Link>
            )}
            {user && (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="block w-full border-b border-neutral-200 px-6 py-3 text-left text-sm font-bold uppercase tracking-wider text-neutral-600 hover:bg-neutral-100 hover:text-[#171717] dark:hover:bg-neutral-100"
              >
                退出登录
              </button>
            )}
          </div>
        )}
      </header>

      <main id="main-content" tabIndex={-1} className="focus:outline-none">
        {/* P0-6 + 后续懒加载路由 fallback — 顶部 nav 不闪,主区域显示骨架 */}
        <Suspense fallback={<RouteFallback />}>{children}</Suspense>
      </main>

      {/* P1-2: 全局 ⌘K 搜索弹层 */}
      {isSearchOpen && (
        <Suspense fallback={null}>
          <CommandPalette open onClose={() => setIsSearchOpen(false)} />
        </Suspense>
      )}

      {/* ============================================================
       * 公共 footer (P1 统一: 从 HomePage SiteFooter 提升, 所有页共享)
       * ============================================================ */}
      <SiteFooter aiCoursesEnabled={aiCoursesEnabled} />


      {/* ============================================================
       * AI 网页助手 FAB(P1-9+ 改:触发 floating chat drawer)
       * dashboard/learning 与全站入口复用同一套真实会话
       * 未登录 → 跳 /auth/login;已登录 → 打开 drawer
       * mobile:bottom-20(在 bottom tab 之上)
       * md+:bottom-6
       * ============================================================ */}
      <button
        type="button"
        onClick={handleOpenWebAssistant}
        className="fixed right-6 bottom-6 hidden h-14 w-14 items-center justify-center rounded-full bg-[#171717] text-white transition-all hover:scale-105 hover:bg-[#262626] md:flex z-40"
        aria-label="打开 AI 网页助手"
        title="AI 网页助手"
        data-testid="web-assistant-fab"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {/* ============================================================
       * 移动端 bottom tab(< 768px 显示)
       * 5 宫格:首页 / 课程 / 学习 / AI 助手 / 我的
       * 当前路由高亮 #171717 (brutalist 主色)
       * ============================================================ */}
      <nav
        className={cn(
          'md:hidden fixed bottom-0 inset-x-0 z-50 bg-neutral-0/95 dark:bg-neutral-100/95 backdrop-blur border-t border-neutral-200',
          // UX-AUDIT-2026-09-11 C-12: WebAssistant 抽屉打开时隐藏 bottom tab，避免
          // (a) 抽屉下方还能看到 5 宫格形成两层 "AI 高亮" 视觉冗余
          // (b) mobile bottom sheet 顶部 20vh 透出底层页面
          isAssistantOpen && 'hidden',
        )}
        aria-label="主导航"
        aria-hidden={isAssistantOpen || undefined}
      >
        <div className="grid grid-cols-5 py-2 pb-[env(safe-area-inset-bottom)]">
          <BottomTabLink
            to="/"
            label="首页"
            icon={Home}
            active={isActive('/')}
          />
          <BottomTabLink
            to="/courses"
            label="课程"
            icon={BookOpen}
            active={isActive('/courses')}
          />
          <BottomTabLink
            to="/dashboard"
            label="学习"
            icon={GraduationCap}
            active={isActive('/dashboard') || isActive('/ai-courses')}
          />
          {/* The general web assistant is a separate capability from private
              course generation, so the personal-course kill switch must not
              remove it. The mobile menu above owns the /ai-courses link. */}
          <MobileAssistantTab
            onClick={handleOpenWebAssistant}
            active={isAssistantOpen}
          />
          <BottomTabLink
            // Always target the protected route. AuthGuard waits for session
            // hydration and preserves the return path for signed-out users;
            // choosing /login from transient store state races hard reloads.
            to="/profile"
            label="我的"
            icon={UserIcon}
            active={isActive('/profile') || isActive('/login')}
          />
        </div>
      </nav>

      {/* ============================================================
       * P1-9+: 全站 AI 网页助手 floating chat drawer
       * 触发:上面那个 FAB + mobile bottom tab AI 入口
       * 关闭:backdrop / X / Esc / 选中 source 后 navigate
       * 跟 dashboard/learning 的课程内小助手互不干扰
       * ============================================================ */}
      {isAssistantOpen && (
        <Suspense fallback={null}>
          <WebAssistantDrawer />
        </Suspense>
      )}
    </div>
  );
}

// 移动 bottom tab 单个 item — P1-3 触摸目标 ≥ 44px(iOS HIG)
function BottomTabLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-[48px] py-1.5 px-2 transition-colors ${
        active
          ? 'text-[#171717]'
          : 'text-neutral-600 dark:text-neutral-600 hover:text-[#171717]'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </Link>
  );
}

function MobileAssistantTab({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="打开 AI 网页助手"
      data-testid="web-assistant-mobile-tab"
      className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 transition-colors ${
        active ? 'text-[#171717]' : 'text-neutral-600 hover:text-[#171717] dark:text-neutral-600'
      }`}
    >
      <Sparkles className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-tight">AI 助手</span>
    </button>
  );
}

// React.lazy() 路由的 Suspense fallback — 顶部 nav 不闪,
// 主区域显示轻量骨架,避免白屏(LCP 友好)
function RouteFallback() {
  return (
    <div
      role="status"
      aria-label="加载中"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
    >
      <Skeleton className="h-10 w-2/3 mb-6" />
      <Skeleton className="h-4 w-full mb-2" count={3} />
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton variant="rectangle" className="h-48" />
        <Skeleton variant="rectangle" className="h-48" />
        <Skeleton variant="rectangle" className="h-48" />
      </div>
    </div>
  );
}

/**
 * SiteFooter — CMS-driven 公共 footer
 *  - brand statement / version: site_settings.brand.footer.*
 *  - 3 列: useList('footer-columns')
 */
function SiteFooter({ aiCoursesEnabled }: { aiCoursesEnabled: boolean }) {
  const columns = useFooterColumns(aiCoursesEnabled);
  const { data: siteData } = useSiteSettings([
    'brand.footer.tagline',
  ]);
  const tagline = pickSite(
    siteData,
    'brand.footer.tagline',
    'zh-CN',
    '学完仍然不会做?让 AI 时代的能力可被看见。',
  );
  const versionTag = `v${__APP_VERSION__} · built for AI era`;
  return (
    <footer className="pt-12 pb-28 md:py-12 border-t border-neutral-200 bg-neutral-50 dark:bg-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-md bg-[#171717] flex items-center justify-center text-white font-bold text-sm">
                S
              </div>
              <span className="font-semibold text-neutral-900">SecondPlanet</span>
            </div>
            <p className="text-sm text-neutral-600 max-w-xs">
              {tagline}
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold mb-3 text-neutral-900">{col.title}</h4>
              <ul className="space-y-2 text-sm text-neutral-600">
                {col.links.map((link) => {
                  // 外链 (http/https) 用 <a>,内链用 <Link>
                  if (link.path.startsWith('http')) {
                    return (
                      <li key={link.path}>
                        <a
                          href={link.path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#171717] transition"
                        >
                          {link.label}
                        </a>
                      </li>
                    );
                  }
                  return (
                    <li key={link.label + link.path}>
                      <Link to={link.path} className="hover:text-[#171717] transition">
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 pt-8 border-t border-neutral-200 text-xs text-neutral-600 flex flex-wrap items-center justify-between gap-4">
          {(() => {
            // 备案号走 env 注入；未配置时不展示未完成态或虚假号码。
            const platformName =
              import.meta.env.VITE_PUBLIC_PLATFORM_NAME ?? 'SecondPlanet';
            const icp = import.meta.env.VITE_ICP?.trim();
            return (
              <span>
                © 2026 {platformName}
                {icp ? ` · 备案号 ${icp}` : ''}
              </span>
            );
          })()}
          <span className="font-mono">{versionTag}</span>
        </div>
      </div>
    </footer>
  );
}
