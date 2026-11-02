/**
 * AdminLayout — admin 侧栏导航
 *
 * P0-7 调整:nav 顺序按 mock 调整(看板 / 课程 / 学位 / 用户 / 黑客松),
 * 保留 徽章管理。
 * 2026-07-24: 评价管理 / 系统设置 都已实装, 无 placeholder。
 */
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  GraduationCap,
  Users,
  BarChart3,
  Award,
  Rocket,
  Settings,
  Star,
  Presentation, // 讲师 icon
} from 'lucide-react';
import { MobileBlocked } from '../../components/MobileBlocked';

interface NavItem {
  path: string;
  label: string;
  icon: typeof BarChart3;
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navItems: NavItem[] = [
    { path: '/admin/dashboard', label: '数据看板', icon: BarChart3 },
    { path: '/admin/courses', label: '课程管理', icon: BookOpen },
    { path: '/admin/instructors', label: '讲师管理', icon: Presentation },
    { path: '/admin/degrees', label: '学位管理', icon: GraduationCap },
    { path: '/admin/users', label: '用户管理', icon: Users },
    { path: '/admin/hackathons', label: '黑客松管理', icon: Rocket },
    { path: '/admin/badges', label: '徽章管理', icon: Award },
    // v1.1.0: 接 ReviewsController,真后端
    { path: '/admin/reviews', label: '评价管理', icon: Star },
    // CMS: 11 tab 统一管理 (cms-design §4)
    { path: '/admin/settings', label: '系统设置', icon: Settings },
  ];

  return (
    <>
      {/* P1-3: < md 拦截,提示用桌面访问 */}
      <MobileBlocked />
      <div className="hidden md:block max-w-7xl mx-auto px-6 py-8 animate-in fade-in duration-300 text-neutral-900 dark:bg-neutral-950">
      <div className="mb-8">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 mb-2">
          / Admin Console
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase text-neutral-900">管理后台</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <aside className="hidden md:block w-full md:w-56 shrink-0">
          <nav className="border-2 border-neutral-900 bg-neutral-0 dark:bg-neutral-100">
            {navItems.map(({ path, label, icon: Icon }, i) => {
              const active = location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-3 px-4 py-3 text-xs font-black uppercase tracking-widest transition-colors ${
                    active
                      ? 'bg-neutral-900 text-neutral-0'
                      : 'text-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-50 hover:text-neutral-900'
                  } ${i < navItems.length - 1 ? 'border-b border-neutral-200' : ''}`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
    </>
  );
}
