/**
 * NotificationsPage — P1-7 通知中心 (重写 — 接真后端)
 *
 * 设计:
 *   - 4 tab: 全部 / 未读 / 系统 / 互动
 *   - 顶部:未读数 chip + "全部标已读" + "清空已读" 两个操作
 *   - 列表:icon(按 type 区分)+ 标题 + body + 相对时间 + 已读状态
 *   - 每条:点链接跳转 / 标已读 / 删除
 *   - 加载:Skeleton 3 行
 *   - 0 数据:EmptyState
 *   - 错误:QueryErrorState
 *   - 30s 轮询 unread-count(更新 bell 角标,本页面用列表 refetch)
 *
 * 系统 / 互动 分类映射:
 *   - 系统: type === 'announcement' | 'order'
 *   - 互动: type === 'comment' | 'hackathon'
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Megaphone, MessageCircle, Trophy, ShoppingBag, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type Notification, type NotificationType } from '../../../lib/notificationsApi';
import { useToast } from '../../../components/auth/Toast';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Card } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { QueryErrorState } from '../../../components/QueryErrorState';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { cn } from '../../../lib/cn';

type Tab = 'all' | 'unread' | 'system' | 'interaction';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
  { key: 'system', label: '系统' },
  { key: 'interaction', label: '互动' },
];

const TYPE_META: Record<string, { icon: typeof Bell; color: string; label: string; tab: 'system' | 'interaction' | null }> = {
  announcement: { icon: Megaphone, color: 'text-info-500 bg-info-100 dark:bg-info-500/20', label: '公告', tab: 'system' },
  order: { icon: ShoppingBag, color: 'text-[#171717] bg-[#EEEDE9]', label: '订单', tab: 'system' },
  comment: { icon: MessageCircle, color: 'text-success-500 bg-success-100 dark:bg-success-500/20', label: '互动', tab: 'interaction' },
  hackathon: { icon: Trophy, color: 'text-warning-500 bg-warning-100 dark:bg-warning-500/20', label: '黑客松', tab: 'interaction' },
};

function getTypeMeta(type: NotificationType) {
  return TYPE_META[type] ?? { icon: Bell, color: 'text-neutral-600 bg-neutral-100', label: '通知', tab: null };
}

function matchesTab(n: Notification, tab: Tab): boolean {
  if (tab === 'all') return true;
  if (tab === 'unread') return !n.read;
  const meta = getTypeMeta(n.type);
  return meta.tab === tab;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications', activeTab],
    queryFn: () =>
      notificationsApi.list({
        page: 1,
        limit: 50,
        unreadOnly: activeTab === 'unread',
      }),
    refetchInterval: 30_000, // 30s 轮询
  });

  const filtered = (data?.data ?? []).filter((n) => matchesTab(n, activeTab));
  const unreadCount = data?.unreadCount ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: (n) => {
      showToast(`已标记 ${n} 条为已读`, 'success');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const clearReadMutation = useMutation({
    mutationFn: () => notificationsApi.clearRead(),
    onSuccess: (n) => {
      showToast(`已清空 ${n} 条已读通知`, 'success');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 顶部 */}
        <PageHeader
          icon={<Bell className="w-5 h-5 text-[#171717]" />}
          title={
            <>
              通知中心
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-danger-500 text-white text-[10px] font-bold ml-2">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </>
          }
          actions={
            <>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#171717] hover:bg-[#EEEDE9] rounded-md transition-colors disabled:opacity-50"
                >
                  <CheckCheck className="w-4 h-4" />
                  全部已读
                </button>
              )}
              <button
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-100 rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                清空已读
              </button>
            </>
          }
        />

        {/* 4 tab */}
        <div className="flex items-center gap-1 border-b border-neutral-200 mb-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                activeTab === t.key
                  ? 'border-[#171717] text-[#171717]'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900',
              )}
            >
              {t.label}
              {t.key === 'unread' && unreadCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-danger-500 text-white text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 内容 */}
        {isError ? (
          <QueryErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rectangle" className="h-20 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-12 h-12" />}
            title={activeTab === 'unread' ? '已读完所有通知' : '暂无通知'}
            description={activeTab === 'unread' ? '你已经在最新的状态,真棒!' : '新通知会显示在这里'}
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((n) => {
              const meta = getTypeMeta(n.type);
              const Icon = meta.icon;
              const content = (
                <div className="flex items-start gap-3 p-4">
                  <div className={cn('shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md', meta.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                          {meta.label}
                        </span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#171717]" aria-label="未读" />}
                      </div>
                      <span className="text-xs text-neutral-600 whitespace-nowrap shrink-0">
                        {relativeTime(n.createdAt)}
                      </span>
                    </div>
                    <h3 className={cn('text-sm font-medium mt-0.5', !n.read && 'font-bold')}>
                      {n.title}
                    </h3>
                    {n.body && (
                      <p className="text-sm text-neutral-600 mt-1 line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                    )}
                  </div>
                </div>
              );
              return (
                <Card
                  key={n.id}
                  padding="none"
                  className={cn(
                    'overflow-hidden transition-colors',
                    !n.read && 'border-l-4 border-l-[#171717]',
                  )}
                >
                  {n.linkUrl ? (
                    <Link
                      to={n.linkUrl}
                      onClick={() => !n.read && markReadMutation.mutate(n.id)}
                      className="block hover:bg-neutral-100 dark:hover:bg-neutral-100 transition-colors"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !n.read && markReadMutation.mutate(n.id)}
                      disabled={n.read || markReadMutation.isPending}
                      className="block w-full cursor-pointer text-left disabled:cursor-default"
                      aria-label={n.read ? `${n.title}，已读` : `${n.title}，标记为已读`}
                    >
                      {content}
                    </button>
                  )}
                  <div className="flex items-center gap-1 px-4 py-2 border-t border-neutral-200 bg-neutral-100/50 dark:bg-neutral-100/50">
                    {!n.read && (
                      <button
                        onClick={() => markReadMutation.mutate(n.id)}
                        disabled={markReadMutation.isPending}
                        className="inline-flex items-center gap-1 text-xs text-[#171717] hover:underline disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />
                        标已读
                      </button>
                    )}
                    <button
                      onClick={() => removeMutation.mutate(n.id)}
                      disabled={removeMutation.isPending}
                      className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-danger-500 hover:underline disabled:opacity-50 ml-auto"
                      aria-label="删除通知"
                    >
                      <Trash2 className="w-3 h-3" />
                      删除
                    </button>
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          await clearReadMutation.mutateAsync();
        }}
        title="确认清空已读通知?"
        description="此操作将永久软删除所有已读通知,未读通知会保留。不可恢复。"
        variant="warning"
        confirmText="确认清空"
      />
    </div>
  );
}
