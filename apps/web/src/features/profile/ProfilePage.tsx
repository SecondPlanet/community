import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ArrowUpRight,
  Award,
  Bell,
  BookOpen,
  Bot,
  Flame,
  GraduationCap,
  LogOut,
  Pencil,
  Save,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  User as UserIcon,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ProgressRing } from '../../components/ProgressRing';
import api from '../../lib/api';
import { useAuth } from '../../lib/auth/AuthContext';
import { badgesApi } from '../../lib/badgesApi';
import { pointsApi } from '../../lib/pointsApi';
import { progressApi } from '../../lib/progressApi';
import type { BadgeWithStatus, UserPoints } from '@secondplanet/shared-types';

type Enrollment = {
  courseId?: string | null;
  course?: { id: string; title: string } | null;
};

type CourseProgress = {
  courseId: string;
  totalLessons: number;
  completedLessons: number;
  percent: number;
  isCompleted: boolean;
};

const personalLinks = [
  { to: '/dashboard', label: '学习中心', description: '继续课程与学习进度', icon: GraduationCap },
  { to: '/hackathons', label: '我的参赛', description: '黑客松报名、组队与作品提交', icon: Trophy },
  { to: '/dashboard/notifications', label: '通知中心', description: '查看课程与系统消息', icon: Bell },
  { to: '/dashboard/orders', label: '我的订单', description: '查看购买与支付记录', icon: ShoppingBag },
  { to: '/dashboard/certificates', label: '我的证书', description: '管理已获得的学习证书', icon: Award },
  { to: '/dashboard/settings/bindings', label: '账号与安全', description: '密码与第三方账号绑定', icon: ShieldCheck },
  { to: '/dashboard/settings/ai', label: 'AI 助手设置', description: '配置个人 AI 服务', icon: Bot },
];

export function ProfilePage() {
  const { user, signOut, updateUser } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(user?.name ?? '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', 'me', user?.id],
    queryFn: async () => {
      const { data } = await api.get<Enrollment[]>('/api/v1/enrollments/me');
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['progress', 'me', 'stats', user?.id],
    queryFn: () => progressApi.getMyStats(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: points } = useQuery({
    queryKey: ['points', 'me', user?.id],
    queryFn: () => pointsApi.getMyPoints(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: badges = [] } = useQuery({
    queryKey: ['badges', 'me', user?.id],
    queryFn: () => badgesApi.getMyBadges(),
    enabled: !!user,
    staleTime: 30_000,
  });

  const courseIds = enrollments
    .map((enrollment) => enrollment.courseId ?? enrollment.course?.id)
    .filter((id): id is string => Boolean(id));

  const { data: progressList = [] } = useQuery({
    queryKey: ['progress', 'courses', user?.id, courseIds],
    queryFn: async () => {
      const result = await Promise.all(
        courseIds.map(async (courseId) => {
          try {
            return await progressApi.getCourseProgress(courseId);
          } catch {
            return null;
          }
        }),
      );
      return result.filter((item): item is CourseProgress => item !== null);
    },
    enabled: !!user && courseIds.length > 0,
    staleTime: 30_000,
  });

  const courseTitleMap = new Map(
    enrollments
      .filter((enrollment) => enrollment.course)
      .map((enrollment) => [enrollment.courseId ?? enrollment.course!.id, enrollment.course!.title]),
  );
  const unlockedBadges = badges.filter((badge) => badge.unlocked).length;

  const handleLogout = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!user || !name) {
      setProfileMessage('姓名不能为空');
      return;
    }
    setProfileBusy(true);
    setProfileMessage(null);
    try {
      const { data } = await api.patch<{ name: string }>(`/api/v1/users/${user.id}`, { name });
      updateUser({ name: data.name });
      setDraftName(data.name);
      setIsEditing(false);
      setProfileMessage('个人资料已更新');
    } catch (error) {
      const message = error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
        : undefined;
      setProfileMessage(Array.isArray(message) ? message[0] : message ?? '保存失败，请稍后重试');
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <div className="min-h-[70dvh] bg-[#F5F4F0] pb-24 text-[#171717] md:pb-0">
      <section className="border-b border-[#171717] bg-[#171717] text-white">
        <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.3em] text-white/50">
            / 我的个人中心
          </div>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-5 md:gap-6">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="个人头像" className="h-20 w-20 shrink-0 rounded-md bg-white object-cover md:h-24 md:w-24" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-white text-3xl font-black text-[#171717] md:h-24 md:w-24 md:text-4xl">
                  {user?.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-black leading-none tracking-tighter md:text-5xl">
                  {user?.name}
                </h1>
                <p className="mt-2 truncate text-sm text-white/60">{user?.email}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex border border-white/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                    {user?.role === 'admin' ? '管理员' : '学员'}
                  </span>
                  {points && (
                    <span className="inline-flex bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-[#171717]">
                      Lv.{points.level}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftName(user?.name ?? '');
                  setProfileMessage(null);
                  setIsEditing((value) => !value);
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-white/30 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-colors hover:bg-white hover:text-[#171717]"
              >
                {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {isEditing ? '取消编辑' : '编辑资料'}
              </button>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-white/30 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-colors hover:bg-white hover:text-[#171717]"
                >
                  <Settings className="h-3.5 w-3.5" /> 管理后台
                </Link>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#171717] transition-colors hover:bg-[#EEEDE9]"
              >
                <LogOut className="h-3.5 w-3.5" /> 退出登录
              </button>
            </div>
          </div>
          {isEditing && (
            <form onSubmit={handleSaveProfile} className="mt-6 grid gap-3 rounded-md border border-white/20 bg-white/10 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-2 block text-xs font-bold">显示姓名</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  maxLength={191}
                  required
                  className="min-h-[44px] w-full rounded-md border border-white/30 bg-white px-3 text-sm font-medium text-[#171717] outline-none focus:border-white"
                />
                <span className="mt-1 block text-[11px] text-white/60">登录邮箱不可在这里修改：{user?.email}</span>
              </label>
              <button
                type="submit"
                disabled={profileBusy || !draftName.trim()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-white px-5 text-xs font-black uppercase tracking-widest text-[#171717] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> {profileBusy ? '保存中…' : '保存修改'}
              </button>
            </form>
          )}
          {profileMessage && (
            <p role="status" className={`mt-3 text-sm ${profileMessage === '个人资料已更新' ? 'text-emerald-300' : 'text-red-300'}`}>
              {profileMessage}
            </p>
          )}
        </div>
      </section>

      <section className="border-b border-[#171717] bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
          {[
            { icon: BookOpen, label: '已完成课时', value: stats?.totalCompletedLessons ?? 0 },
            { icon: Flame, label: '连续学习', value: `${stats?.streakDays ?? 0} 天` },
            { icon: Award, label: '已获徽章', value: `${unlockedBadges}/${badges.length}` },
            { icon: UserIcon, label: '我的积分', value: points?.points ?? 0 },
          ].map(({ icon: Icon, label, value }, index) => (
            <div
              key={label}
              className={`p-5 md:p-8 ${index % 2 === 0 ? 'border-r' : ''} ${index < 2 ? 'border-b md:border-b-0' : ''} md:border-r md:last:border-r-0 border-[#171717]`}
            >
              <Icon className="mb-3 h-5 w-5 text-[#666666]" />
              <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#666666]">{label}</div>
              <div className="text-3xl font-black tracking-tighter md:text-4xl">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-6 py-10 md:py-12">
        <section className="border border-[#171717] bg-white">
          <div className="border-b border-[#171717] p-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">/ 01 个人服务</div>
            <h2 className="mt-1 text-xl font-black tracking-tight">我的空间</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {personalLinks.map(({ to, label, description, icon: Icon }, index) => (
              <Link
                key={to}
                to={to}
                className={`group flex min-h-[112px] items-start gap-4 p-5 transition-colors hover:bg-[#F5F4F0] ${index < 3 ? 'lg:border-b' : ''} ${index < 4 ? 'sm:border-b lg:border-b-0' : ''} ${index % 2 === 0 ? 'sm:border-r' : ''} ${index % 3 !== 2 ? 'lg:border-r' : 'lg:border-r-0'} border-[#EEEDE9]`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#171717] text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-black tracking-tight">
                    {label}<ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#666666]">{description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {points && (
              <LevelPanel points={points} />
            )}

            <section className="border border-[#171717] bg-white">
              <div className="flex items-center justify-between border-b border-[#171717] p-5">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">/ 02 学习活动</div>
                  <h2 className="mt-1 text-xl font-black tracking-tight">最近 52 周</h2>
                </div>
              </div>
              <div className="overflow-x-auto p-5">
                {stats ? <ActivityGrid data={stats.activity ?? []} /> : <div className="h-24 animate-pulse rounded-md bg-[#F5F4F0]" />}
              </div>
            </section>

            <section className="border border-[#171717] bg-white">
              <div className="flex items-center justify-between border-b border-[#171717] p-5">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">/ 03 学习进度</div>
                  <h2 className="mt-1 text-xl font-black tracking-tight">我的课程</h2>
                </div>
                <Link to="/dashboard" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest hover:underline">
                  进入学习中心 <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div>
                {progressList.length > 0 ? progressList.slice(0, 4).map((courseProgress, index) => (
                  <Link
                    key={courseProgress.courseId}
                    to={`/courses/${courseProgress.courseId}`}
                    className={`flex items-center gap-4 p-5 transition-colors hover:bg-[#F5F4F0] ${index < Math.min(progressList.length, 4) - 1 ? 'border-b border-[#EEEDE9]' : ''}`}
                  >
                    <ProgressRing percent={courseProgress.percent} size={56} strokeWidth={5} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-black tracking-tight">{courseTitleMap.get(courseProgress.courseId) ?? '课程'}</div>
                      <div className="mt-0.5 text-xs font-medium text-[#666666]">{courseProgress.completedLessons}/{courseProgress.totalLessons} 课时</div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-[#666666]" />
                  </Link>
                )) : (
                  <div className="p-10 text-center">
                    <p className="mb-4 text-sm text-[#666666]">还没有报名课程</p>
                    <Link to="/courses" className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#171717] px-4 py-2 text-xs font-black uppercase tracking-widest text-white">
                      浏览课程 <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="h-fit border border-[#171717] bg-white lg:col-span-1">
            <div className="border-b border-[#171717] p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#666666]">/ 04 我的徽章</div>
              <div className="mt-1 flex items-end justify-between">
                <h2 className="text-xl font-black tracking-tight">徽章墙</h2>
                <div className="text-2xl font-black tracking-tighter">{unlockedBadges}<span className="ml-1 text-sm text-[#A3A3A3]">/{badges.length}</span></div>
              </div>
            </div>
            <div className="p-5">
              {badges.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">{badges.map((badge) => <BadgeItem key={badge.id} badge={badge} />)}</div>
              ) : (
                <p className="py-6 text-center text-sm text-[#666666]">继续学习，解锁你的第一枚徽章</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LevelPanel({ points }: { points: UserPoints }) {
  const range = Math.max(points.nextLevelPoints - points.currentLevelPoints, 1);
  const percent = Math.min(100, Math.max(0, ((points.points - points.currentLevelPoints) / range) * 100));

  return (
    <section className="border-2 border-[#171717] bg-white">
      <div className="flex items-end justify-between gap-4 border-b border-[#171717] p-6">
        <div>
          <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-[#666666]">/ 我的等级</div>
          <div className="text-5xl font-black leading-none tracking-tighter md:text-6xl">Lv.{points.level}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black tracking-tighter md:text-4xl">{points.points}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-[#666666]">累计积分</div>
        </div>
      </div>
      <div className="p-6">
        <div className="mb-2 flex justify-between text-[10px] font-black uppercase tracking-widest text-[#666666]">
          <span>{points.currentLevelPoints} pts</span><span>{points.nextLevelPoints} pts</span>
        </div>
        <div className="h-3 overflow-hidden bg-[#EEEDE9]">
          <div className="h-full bg-[#171717] transition-all duration-700" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-widest">距升级还需 {points.pointsToNextLevel} 积分</p>
      </div>
    </section>
  );
}

function ActivityGrid({ data }: { data: Array<{ date: string; count: number }> }) {
  const activity = new Map(data.map((item) => [item.date, item.count]));
  const maxCount = Math.max(1, ...data.map((item) => item.count));
  const today = new Date();
  const cells = Array.from({ length: 364 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (363 - index));
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: activity.get(key) ?? 0 };
  });
  const level = (count: number) => {
    if (count === 0) return 'bg-[#EEEDE9]';
    if (count <= maxCount * 0.33) return 'bg-[#171717]/35';
    if (count <= maxCount * 0.66) return 'bg-[#171717]/65';
    return 'bg-[#171717]';
  };

  return (
    <div className="min-w-[560px]">
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
        {cells.map((day) => (
          <span key={day.date} title={`${day.date}：完成 ${day.count} 个课时`} className={`h-2.5 w-2.5 rounded-[2px] ${level(day.count)}`} />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-[#666666]">
        <span>少</span><span className="h-3 w-3 bg-[#EEEDE9]" /><span className="h-3 w-3 bg-[#171717]/35" /><span className="h-3 w-3 bg-[#171717]/65" /><span className="h-3 w-3 bg-[#171717]" /><span>多</span>
      </div>
    </div>
  );
}

function BadgeItem({ badge }: { badge: BadgeWithStatus }) {
  const achieved = !badge.unlocked && badge.target > 0 && badge.progress >= badge.target;
  const displayProgress = Math.min(badge.progress, badge.target);

  return (
    <div
      className={`relative border-2 border-[#171717] p-2.5 ${badge.unlocked ? 'bg-white' : achieved ? 'bg-amber-50' : 'bg-[#F5F4F0] opacity-65'}`}
      title={achieved ? `${badge.description}（条件已达成，等待系统发放）` : badge.description}
    >
      <div className={`mb-2 flex h-8 w-8 items-center justify-center ${badge.unlocked ? 'bg-[#171717] text-white' : 'bg-[#EEEDE9] grayscale'}`}>
        <Award className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="line-clamp-1 text-[10px] font-black leading-tight">{badge.name}</div>
      <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#666666]">
        {badge.unlocked ? '已解锁' : achieved ? '条件已达成' : `${displayProgress}/${badge.target}`}
      </div>
    </div>
  );
}
