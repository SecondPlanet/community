/**
 * AdminUsersPage — P1-3 重写 (admin 用户管理) — brutalist 重构
 *
 * 功能:
 *   - 顶部:搜索框(邮箱/昵称 模糊)
 *   - 表格:头像 + 昵称 + 邮箱 + 角色 chip + 操作(查看详情 / 改角色)
 *   - 行内"查看" → 右侧 Drawer 弹出 5 section:
 *     1) 基本信息:头像 / 邮箱 / 角色 / 注册时间 / 最后登录
 *     2) 学习概况:报名课程数 / 完成进度 / 累计学习时长(派生自 enrollments)
 *     3) 订单:最近 20 笔(从 findOne 内联返回)
 *     4) 证书:最近 20 张
 *     5) 积分:当前积分 + 最近 20 笔流水
 *   - 5 操作(在 Drawer 内):
 *     1) 改角色:下拉 student/instructor/admin
 *     2) 授权课程:输入课程 ID 逗号分隔
 *     3) 重置密码:由服务端生成一次性临时密码并吊销旧会话
 *     4) 停用/恢复账号:立即阻断访问并吊销会话，保留历史数据
 *
 * 设计:brutalist — 跟 AdminBadgesPage / AdminCoursesPage / AdminReviewsPage 一致
 *   - 黑白硬边、无圆角、无阴影、tracking-widest
 *   - 不使用 dark mode 变体(其他 admin 页也是亮态)
 *   - 不用 <Card> / <Button> / <Input> 基础组件,改 brutalist helpers
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Eye,
  Shield,
  ShieldCheck,
  GraduationCap,
  ShoppingBag,
  Award,
  Coins,
  RefreshCw,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../components/auth/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Drawer } from '../../components/ui/Drawer';
import { Skeleton } from '../../components/ui/Skeleton';
import { I18nText } from '../../components/I18nText';
import { useLocaleDate } from '../../hooks/useLocaleDate';
import { cn } from '../../lib/cn';
import { useEnum, useI18n } from '../../lib/cms';

interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'instructor' | 'admin';
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  deletedAt?: string | null;
}

interface UserDetail extends UserSummary {
  points: number;
  level: number;
  passwordResetRequired: boolean;
  enrollments: Array<{
    id: string;
    enrolledAt: string;
    expiresAt?: string | null;
    source: string;
    course?: { id: string; title: string; thumbnail?: string | null; _count?: { lessons: number; chapters: number } } | null;
    degree?: { id: string; title: string } | null;
    // P1 修复(2026-07-24): 完成度
    completedLessonsCount?: number;
    isCompleted?: boolean;
    progressPercent?: number;
  }>;
  orders: Array<{
    id: string;
    status: string;
    amount: number;
    type: string;
    createdAt: string;
    paidAt?: string | null;
  }>;
  certificates: Array<{
    id: string;
    type: string;
    title: string;
    serialNumber: string;
    issuedAt: string;
  }>;
  pointTransactions: Array<{
    id: string;
    delta: number;
    reason: string;
    createdAt: string;
  }>;
  _count: {
    enrollments: number;
    orders: number;
    certificates: number;
    progressRecords: number;
    submissions: number;
  };
}

const ROLE_META: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  student: {
    label: '学员',
    color: 'border border-[#171717] text-[#171717]',
    icon: UserIcon,
  },
  instructor: {
    label: '讲师',
    color: 'border border-[#171717] text-[#171717] bg-[#EEEDE9]',
    icon: GraduationCap,
  },
  admin: {
    label: '管理员',
    color: 'bg-[#171717] text-white',
    icon: ShieldCheck,
  },
};

// Fallback: order_status 颜色硬编码(API 失败时),AdminUsersPage 在订单列里用
const FALLBACK_STATUS_COLOR: Record<string, string> = {
  pending: 'border border-[#171717] text-[#171717]',
  paid: 'bg-[#171717] text-white',
  failed: 'border border-[#171717] text-[#171717] bg-[#F5F4F0]',
  refunded: 'border border-[#171717] text-[#171717] bg-[#EEEDE9]',
  cancelled: 'border border-[#171717] text-[#666666]',
  expired: 'border border-[#171717] text-[#666666]',
};

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [accountStatus, setAccountStatus] = useState<'active' | 'disabled' | 'all'>('active');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 列表
  const { data: users, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users', search, accountStatus],
    queryFn: async () => {
      const { data } = await api.get<{ data: UserSummary[] }>(
        '/api/v1/users',
        { params: { search, status: accountStatus, limit: 100 } },
      );
      return data.data;
    },
  });

  // 详情
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-user-detail', selectedUserId],
    queryFn: async () => {
      const { data } = await api.get<UserDetail>(`/api/v1/users/${selectedUserId}`);
      return data;
    },
    enabled: !!selectedUserId,
  });

  // 改角色
  const roleMutation = useMutation({
    mutationFn: (newRole: string) =>
      api.patch(`/api/v1/users/${selectedUserId}`, { role: newRole }),
    onSuccess: () => {
      showToast(t('admin.users.toast.role_updated', '角色已更新'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', selectedUserId] });
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message ?? t('admin.users.toast.update_failed', '更新失败'), 'error');
    },
  });

  // 授权课程
  const grantMutation = useMutation({
    mutationFn: (courseIds: string[]) =>
      api.post(`/api/v1/users/${selectedUserId}/grant-course`, { courseIds }),
    onSuccess: (res) => {
      showToast(
        t('admin.users.toast.grant_success', '已授权 {count} 门课程').replace('{count}', String(res.data.granted)),
        'success',
      );
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', selectedUserId] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t('admin.users.toast.grant_failed', '授权失败'), 'error'),
  });

  // 重置密码
  const resetPwdMutation = useMutation({
    mutationFn: () =>
      api.post<{ temporaryPassword: string }>(`/api/v1/users/${selectedUserId}/reset-password`),
    onSuccess: ({ data }) => {
      showToast(
        t('admin.users.toast.temp_password', '临时密码:{password}(请复制告知用户,刷新页面后消失)').replace('{password}', data.temporaryPassword),
        'success',
        15000,
      );
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', selectedUserId] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t('admin.users.toast.reset_failed', '重置失败'), 'error'),
  });

  // 停用
  const disableMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/users/${selectedUserId}`),
    onSuccess: () => {
      showToast(t('admin.users.toast.disabled', '用户已停用，现有会话已失效'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setConfirmDelete(false);
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', selectedUserId] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t('admin.users.toast.disable_failed', '停用失败'), 'error'),
  });

  const restoreMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/users/${selectedUserId}/restore`),
    onSuccess: () => {
      showToast(t('admin.users.toast.restored', '用户已恢复，可重新登录'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-detail', selectedUserId] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message ?? t('admin.users.toast.restore_failed', '恢复失败'), 'error'),
  });

  return (
    <div>
      {/* 顶部 */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-2">
            <I18nText k="admin.users.eyebrow" default="/ Admin · Users" />
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">
            <I18nText k="admin.users.title" default="用户管理" />
          </h2>
        </div>
        <div className="flex w-full max-w-xl items-end gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#666666]">
            账号状态
            <select
              value={accountStatus}
              onChange={(event) => setAccountStatus(event.target.value as typeof accountStatus)}
              className="mt-1 block min-h-10 border-2 border-[#171717] bg-white px-3 text-xs font-black uppercase"
            >
              <option value="active">正常</option>
              <option value="disabled">已停用</option>
              <option value="all">全部</option>
            </select>
          </label>
          <div className="relative flex-1">
            <label htmlFor="admin-user-search" className="sr-only">搜索用户</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999999]" />
            <input
              id="admin-user-search"
              type="text"
              placeholder={t('admin.users.search_placeholder', '搜索邮箱 / 昵称...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-neutral-100 border-2 border-[#171717] dark:border-neutral-50 text-sm text-[#171717] dark:text-neutral-50 focus:outline-none focus:bg-[#EEEDE9] focus:ring-2 focus:ring-[#171717] dark:focus:bg-neutral-800 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* 错误态 */}
      {isError && (
        <div className="border-2 border-[#171717] bg-[#F5F4F0] text-[#171717] p-4 text-sm">
          <I18nText k="admin.users.load_failed" default="加载用户列表失败" />
          <button onClick={() => refetch()} className="ml-2 underline">
            <I18nText k="common.retry" default="重试" />
          </button>
        </div>
      )}

      {/* 表格 */}
      <div className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100">
        <div className="hidden md:grid md:grid-cols-12 gap-4 p-4 border-b-2 border-[#171717] text-[10px] font-black uppercase tracking-widest text-[#666666]">
          <div className="md:col-span-1">#</div>
          <div className="md:col-span-4">User</div>
          <div className="md:col-span-4">Email</div>
          <div className="md:col-span-2">Role</div>
          <div className="md:col-span-1 text-right">Action</div>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="text" className="h-12 w-full" />
            ))}
          </div>
        ) : users && users.length > 0 ? (
          users.map((user, i) => {
            const roleMeta = ROLE_META[user.role] ?? ROLE_META.student;
            const RoleIcon = roleMeta.icon;
            return (
              <div
                key={user.id}
                className={cn(
                  'grid grid-cols-1 md:grid-cols-12 gap-4 p-4 items-center text-sm',
                  i < users.length - 1 && 'border-b border-[#EEEDE9]',
                  'hover:bg-[#F5F4F0] transition-colors',
                  user.deletedAt && 'opacity-60',
                )}
              >
                <div className="col-span-12 md:col-span-1 text-[10px] font-black text-[#A3A3A3]">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div className="col-span-12 md:col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-[#171717] text-white text-sm font-black flex items-center justify-center shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-black tracking-tight truncate">{user.name}</span>
                  {user.deletedAt && (
                    <span className="border border-[#171717] px-1.5 py-0.5 text-[9px] font-black uppercase">
                      已停用
                    </span>
                  )}
                </div>
                <div className="col-span-12 md:col-span-4 text-xs text-[#666666] truncate flex items-center gap-1.5">
                  <Mail className="w-3 h-3" /> {user.email}
                </div>
                <div className="col-span-12 md:col-span-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest',
                      roleMeta.color,
                    )}
                  >
                    <RoleIcon className="w-3 h-3" />
                    {roleMeta.label}
                  </span>
                </div>
                <div className="col-span-12 md:col-span-1 text-right">
                  <button
                    onClick={() => setSelectedUserId(user.id)}
                    className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-black uppercase tracking-widest border border-[#171717] hover:bg-[#171717] hover:text-white transition-colors"
                  >
                    <Eye className="w-3 h-3" /> <I18nText k="admin.users.action.detail" default="详情" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-16 text-center text-sm text-[#666666]">
            <I18nText k="admin.users.empty" default="未找到用户" />
          </div>
        )}
      </div>

      {/* 详情 Drawer */}
      <Drawer
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        title={detail ? `${detail.name} (${detail.email})` : t('admin.users.detail_title', '用户详情')}
        width={520}
      >
        {detailLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton variant="text" className="h-6 w-1/2" />
            <Skeleton variant="rectangle" className="h-32 w-full" />
            <Skeleton variant="rectangle" className="h-24 w-full" />
          </div>
        ) : detail ? (
          <UserDetailContent
            detail={detail}
            showToast={showToast}
            onChangeRole={(r) => roleMutation.mutate(r)}
            onGrantCourses={(ids) => grantMutation.mutate(ids)}
            onResetPassword={() => resetPwdMutation.mutate()}
            onDisable={() => setConfirmDelete(true)}
            onRestore={() => restoreMutation.mutate()}
            isUpdating={
              roleMutation.isPending ||
              grantMutation.isPending ||
              resetPwdMutation.isPending ||
              disableMutation.isPending ||
              restoreMutation.isPending
            }
          />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await disableMutation.mutateAsync();
        }}
        title={t('admin.users.disable_confirm.title', '确认停用该用户?')}
        description={t('admin.users.delete_confirm.desc', '账号将被停用并立即吊销登录会话；历史报名、订单和证书会保留。')}
        variant="danger"
        confirmText={t('admin.users.disable_confirm.confirm', '确认停用')}
      />
    </div>
  );
}

// =============================================================
// 抽屉内容(6 section)
// =============================================================
function UserDetailContent({
  detail,
  showToast,
  onChangeRole,
  onGrantCourses,
  onResetPassword,
  onDisable,
  onRestore,
  isUpdating,
}: {
  detail: UserDetail;
  showToast: (msg: string, variant?: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void;
  onChangeRole: (r: string) => void;
  onGrantCourses: (ids: string[]) => void;
  onResetPassword: () => void;
  onDisable: () => void;
  onRestore: () => void;
  isUpdating: boolean;
}) {
  const [courseInput, setCourseInput] = useState('');
  const [showGrant, setShowGrant] = useState(false);
  const { getColor: getOrderStatusColor } = useEnum('order_status');
  const { t } = useI18n();
  const { formatDate, formatDateTime, formatNumber } = useLocaleDate();

  const roleMeta = ROLE_META[detail.role] ?? ROLE_META.student;
  const RoleIcon = roleMeta.icon;
  const isDisabled = Boolean(detail.deletedAt);
  // 优先 API colorClass, fallback 走原硬编码
  const orderStatusClass = (s: string) =>
    getOrderStatusColor(s) || FALLBACK_STATUS_COLOR[s] || FALLBACK_STATUS_COLOR.pending;

  return (
    <div className="divide-y divide-[#EEEDE9]">
      {/* 1) 基本信息 */}
      <section className="p-5">
        <SectionTitle icon={UserIcon} title={t('admin.users.section.basic', '基本信息')} />
        <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
          <Field label={t('admin.users.field.user_id', '用户 ID')} value={<span className="font-mono text-xs">{detail.id}</span>} />
          <Field label={t('admin.users.field.role', '角色')}>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest',
                roleMeta.color,
              )}
            >
              <RoleIcon className="w-3 h-3" /> {roleMeta.label}
            </span>
          </Field>
          <Field label={t('admin.users.field.created_at', '注册时间')} value={formatDate(detail.createdAt)} />
          <Field label={t('admin.users.field.last_login', '最后登录')} value={formatDateTime(detail.lastLoginAt)} />
          <Field
            label={t('admin.users.field.points', '积分')}
            value={`${formatNumber(detail.points)} (Lv.${detail.level})`}
          />
          <Field label={t('admin.users.field.password_reset', '需重置密码')}>
            {detail.passwordResetRequired ? (
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-[#171717] text-white">
                <I18nText k="admin.users.flag.yes" default="是" />
              </span>
            ) : (
              <span className="text-[#666666]">
                <I18nText k="admin.users.flag.no" default="否" />
              </span>
            )}
          </Field>
          <Field
            label="账号状态"
            value={isDisabled ? `已停用 · ${formatDateTime(detail.deletedAt)}` : '正常'}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <select
            value={detail.role}
            onChange={(e) => onChangeRole(e.target.value)}
            disabled={isUpdating || isDisabled}
            aria-label={t('admin.users.field.change_role', '修改角色')}
            className="px-3 py-2 bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 disabled:opacity-50"
          >
            <option value="student">student</option>
            <option value="instructor">instructor</option>
            <option value="admin">admin</option>
          </select>
          <BrutalButton
            size="sm"
            variant="secondary"
            disabled={isUpdating || isDisabled}
            onClick={onResetPassword}
          >
            <I18nText k="admin.users.action.reset_password" default="重置密码" />
          </BrutalButton>
          {isDisabled ? (
            <BrutalButton size="sm" variant="primary" disabled={isUpdating} onClick={onRestore}>
              恢复账号
            </BrutalButton>
          ) : (
            <BrutalButton size="sm" variant="danger" disabled={isUpdating} onClick={onDisable}>
              停用账号
            </BrutalButton>
          )}
        </div>
        <p className="text-[10px] text-[#666666] mt-2">
          停用后所有访问令牌与刷新会话立即失效；恢复不会删除或重建历史业务数据。
        </p>
      </section>

      {/* 2) 学习概况 */}
      <section className="p-5">
        <SectionTitle icon={GraduationCap} title={t('admin.users.section.learning', '学习概况')} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <StatBox label={t('admin.users.stat.enrollments', '报名课程')} value={detail._count.enrollments} />
          <StatBox label={t('admin.users.stat.orders', '订单')} value={detail._count.orders} />
          <StatBox label={t('admin.users.stat.certificates', '证书')} value={detail._count.certificates} />
          <StatBox label={t('admin.users.stat.progress', '进度记录')} value={detail._count.progressRecords} />
          <StatBox label={t('admin.users.stat.submissions', '作品提交')} value={detail._count.submissions} />
          <StatBox label={t('admin.users.stat.points', '积分')} value={detail.points} />
        </div>
        {detail.enrollments.length > 0 && (
          <div className="mt-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
              <I18nText k="admin.users.recent_enrollments" default="最近报名 (前 20)" />
            </h4>
            <ul className="space-y-1 text-xs">
              {detail.enrollments.slice(0, 10).map((e) => {
                // P1 修复(2026-07-24): 完成度 + "已完成" 标记
                const total = e.course?._count?.lessons ?? 0;
                const pct = e.progressPercent ?? 0;
                const isDone = e.isCompleted ?? false;
                return (
                  <li
                    key={e.id}
                    className="py-1.5 px-2 bg-[#F5F4F0]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate flex-1">
                        {e.course?.title ?? e.degree?.title ?? t('admin.users.unknown_course', '未知课程')}
                      </span>
                      {e.course && total > 0 && (
                        <span
                          className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 ${
                            isDone
                              ? 'bg-[#171717] text-white'
                              : pct > 0
                                ? 'border border-[#171717] text-[#171717]'
                                : 'text-[#A3A3A3]'
                          }`}
                        >
                          {isDone ? '✓ 已完成' : `${pct}%`}
                        </span>
                      )}
                      <span className="text-[#666666] whitespace-nowrap">
                        {formatDate(e.enrolledAt)}
                      </span>
                    </div>
                    {e.course && total > 0 && !isDone && pct > 0 && (
                      <div className="mt-1 h-1 bg-[#EEEDE9]">
                        <div
                          className="h-full bg-[#171717] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* 3) 订单 */}
      <section className="p-5">
        <SectionTitle
          icon={ShoppingBag}
          title={t('admin.users.section.orders', '订单 ({count})').replace('{count}', String(detail._count.orders))}
        />
        {detail.orders.length === 0 ? (
          <p className="text-xs text-[#666666] mt-2">
            <I18nText k="admin.users.no_orders" default="无订单" />
          </p>
        ) : (
          <ul className="space-y-1.5 mt-3 text-xs">
            {detail.orders.slice(0, 10).map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 py-1.5 px-2 bg-[#F5F4F0]"
              >
                <div className="min-w-0">
                  <div className="font-mono">{o.id.slice(0, 8).toUpperCase()}</div>
                  <div className="text-[#666666]">{o.type} · ¥{Number(o.amount).toFixed(2)}</div>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest',
                    orderStatusClass(o.status),
                  )}
                >
                  {o.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4) 证书 */}
      <section className="p-5">
        <SectionTitle
          icon={Award}
          title={t('admin.users.section.certificates', '证书 ({count})').replace('{count}', String(detail._count.certificates))}
        />
        {detail.certificates.length === 0 ? (
          <p className="text-xs text-[#666666] mt-2">
            <I18nText k="admin.users.no_certificates" default="未获证书" />
          </p>
        ) : (
          <ul className="space-y-1.5 mt-3 text-xs">
            {detail.certificates.slice(0, 10).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 py-1.5 px-2 bg-[#F5F4F0]"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.title}</div>
                  <div className="font-mono text-[10px] text-[#666666]">{c.serialNumber}</div>
                </div>
                <span className="text-[10px] text-[#666666] whitespace-nowrap">
                  {formatDate(c.issuedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 5) 积分 */}
      <section className="p-5">
        <SectionTitle
          icon={Coins}
          title={t('admin.users.section.points', '积分 (当前 {count})').replace('{count}', String(detail.points))}
        />
        {detail.pointTransactions.length === 0 ? (
          <p className="text-xs text-[#666666] mt-2">
            <I18nText k="admin.users.no_point_history" default="无流水" />
          </p>
        ) : (
          <ul className="space-y-1 mt-3 text-xs">
            {detail.pointTransactions.slice(0, 10).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 py-1.5 px-2 bg-[#F5F4F0]"
              >
                <span className="truncate text-[#666666]">{p.reason}</span>
                <span
                  className={cn(
                    'font-black tabular-nums',
                    p.delta >= 0 ? 'text-[#171717]' : 'text-[#666666] line-through',
                  )}
                >
                  {p.delta >= 0 ? '+' : ''}
                  {p.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 6) 授权课程操作 */}
      <section className="p-5">
        <SectionTitle icon={RefreshCw} title={t('admin.users.section.grant', '授权课程')} />
        {!showGrant ? (
          <div className="mt-3">
            <BrutalButton
              size="sm"
              variant="secondary"
              disabled={isUpdating || isDisabled}
              onClick={() => setShowGrant(true)}
            >
              <I18nText k="admin.users.action.grant_new" default="授权新课程" />
            </BrutalButton>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <BrutalField
              label={t('admin.users.field.course_ids', '课程 ID(逗号分隔)')}
              value={courseInput}
              onChange={setCourseInput}
              placeholder={t('admin.users.placeholder.course_ids', '例如:abc123, def456')}
            />
            <div className="flex gap-2">
              <BrutalButton
                size="sm"
                variant="primary"
                disabled={isUpdating || isDisabled}
                onClick={() => {
                  const ids = courseInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (ids.length === 0) {
                    showToast(t('admin.users.toast.empty_course_ids', '请输入至少一个课程 ID'), 'warning');
                    return;
                  }
                  onGrantCourses(ids);
                  setCourseInput('');
                  setShowGrant(false);
                }}
              >
                <I18nText k="admin.users.action.confirm_grant" default="确认授权" />
              </BrutalButton>
              <BrutalButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setShowGrant(false);
                  setCourseInput('');
                }}
              >
                <I18nText k="common.cancel" default="取消" />
              </BrutalButton>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof UserIcon; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[#171717]">
      <Icon className="w-4 h-4" />
      {title}
    </h3>
  );
}

function Field({ label, children, value }: { label: string; children?: React.ReactNode; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium">{children ?? value}</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#F5F4F0] p-3 text-center">
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mt-1">
        {label}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Brutalist 表单组件 — 跟 AdminBadgesPage / AdminCoursesPage 同风格
// 黑白硬边、无圆角、统一 tracking-widest 标签
// ──────────────────────────────────────────────────────────────────────

function BrutalField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2 flex items-center gap-1">
        {label}
        {required && <span className="text-red-600">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          required={required}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 text-sm text-[#171717] dark:text-neutral-50 focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 transition-colors resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 text-sm text-[#171717] dark:text-neutral-50 focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 transition-colors"
        />
      )}
    </div>
  );
}

function BrutalButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center font-black uppercase tracking-widest transition-colors disabled:opacity-50';
  const sizeCls = size === 'sm' ? 'px-4 py-2 text-[10px]' : 'px-6 py-3 text-xs';
  const variantCls = {
    primary: 'bg-[#171717] text-white hover:bg-[#262626]',
    secondary: 'border border-[#171717] text-[#171717] hover:bg-[#EEEDE9]',
    danger: 'border border-[#171717] text-[#171717] hover:bg-[#171717] hover:text-white',
  }[variant];
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizeCls} ${variantCls} ${className}`}
    >
      {children}
    </button>
  );
}
