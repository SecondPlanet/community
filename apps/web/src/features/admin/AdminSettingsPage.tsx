/**
 * AdminSettingsPage — CMS 统一管理 (11 tab)
 *
 * 设计契约: review/cms-design.md §4
 * 风格: 跟 AdminBadgesPage / AdminCoursesPage 一致 — brutalist 黑色边框 + uppercase tracking
 *
 * P2-3 接通:
 *   - Tab 1 (全局) 接 useApiMutation 持久化 site / app settings(单条 PATCH / POST / DELETE)
 *   - Tab 3 (枚举) 接 create / update / delete 3 个 mutation,启用 3 个 disabled 按钮
 *   - 9 个 ListCrudTab saveEdit / createRow / removeRow / toggleActive 改 useApiMutation
 *   - ListCrudTab 删除用 ConfirmDialog 二次确认
 */
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  FileText,
  Tags,
  Quote,
  Lightbulb,
  LayoutGrid,
  Search as SearchIcon,
  KeyRound,
  Compass,
  Globe,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
} from 'lucide-react';
import { useToast } from '../../components/auth/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { useApiMutation } from '../../hooks/useApiMutation';
import type { EnumItem } from '../../lib/cms';
import api from '../../lib/api';

// =============================================================
// 11 个 tab 的定义
// =============================================================
type TabKey =
  | 'global'
  | 'page'
  | 'enums'
  | 'testimonials'
  | 'quick_prompts'
  | 'course_categories'
  | 'searches'
  | 'auth_providers'
  | 'navigation'
  | 'i18n'
  | 'date_formats';

interface TabDef {
  key: TabKey;
  label: string;
  shortLabel: string;
  icon: typeof SettingsIcon;
}

const TABS: TabDef[] = [
  { key: 'global', label: '全局设置', shortLabel: 'Global', icon: SettingsIcon },
  { key: 'page', label: '页面文案', shortLabel: 'Page', icon: FileText },
  { key: 'enums', label: '枚举', shortLabel: 'Enums', icon: Tags },
  { key: 'testimonials', label: '学员故事', shortLabel: 'Quo', icon: Quote },
  { key: 'quick_prompts', label: '快捷 Prompt', shortLabel: 'QP', icon: Lightbulb },
  { key: 'course_categories', label: '课程分类', shortLabel: 'CC', icon: LayoutGrid },
  { key: 'searches', label: '热门搜索/关键词', shortLabel: 'Sea', icon: SearchIcon },
  { key: 'auth_providers', label: 'Auth Providers', shortLabel: 'Auth', icon: KeyRound },
  { key: 'navigation', label: '导航 / Footer', shortLabel: 'Nav', icon: Compass },
  { key: 'i18n', label: 'i18n 通用文案', shortLabel: 'i18n', icon: Globe },
  { key: 'date_formats', label: '日期格式', shortLabel: 'Date', icon: Calendar },
];

// =============================================================
// 头部(11 tab 横向 / 移动折叠)
// =============================================================
function PageHeader({ activeTab, onChange }: { activeTab: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div className="mb-6">
      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] dark:text-neutral-400 mb-2">
        / Admin · CMS
      </div>
      <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">系统设置</h2>
      <p className="mt-2 text-sm text-[#666666] dark:text-neutral-400 max-w-2xl">
        统一管理站点文案、导航、页脚与枚举配置。编辑保存后，前台页面会自动生效。
      </p>
      <div className="mt-6 border-b-2 border-[#171717] dark:border-neutral-50 -mx-4 sm:mx-0">
        <div className="flex items-center gap-0 overflow-x-auto px-4 sm:px-0 scrollbar-hide">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-widest border-b-4 -mb-[2px] transition-colors whitespace-nowrap',
                  active
                    ? 'border-[#171717] text-[#171717] dark:border-neutral-50 dark:text-neutral-50 bg-white dark:bg-neutral-100'
                    : 'border-transparent text-[#666666] dark:text-neutral-400 hover:text-[#171717] dark:hover:text-neutral-50',
                )}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Tab 1: 全局设置(site_settings + app_settings)
//
// P2-3a 接真后端:site / app settings 用 admin endpoint 拉 list,
// 走 useApiMutation 单个 PATCH 持久化。
// =============================================================
function GlobalSettingsTab() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  // 拉 admin 列表(返 SiteSetting[] 形状)
  const { data: siteList, isLoading: siteLoading } = useQuery({
    queryKey: ['cms-admin', 'site-settings-list'],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/api/v1/admin/cms/site-settings');
      return Array.isArray(data) ? data : (data as any)?.data ?? [];
    },
    retry: 0,
  });
  // 拉 admin app_settings 列表
  const { data: appList, isLoading: appLoading } = useQuery({
    queryKey: ['cms-admin', 'app-settings-list'],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/api/v1/admin/cms/app-settings');
      return Array.isArray(data) ? data : (data as any)?.data ?? [];
    },
    retry: 0,
  });
  const [siteDraft, setSiteDraft] = useState<Record<string, any>>({});
  const [appDraft, setAppDraft] = useState<Record<string, any>>({});
  const [appKeys, setAppKeys] = useState<string[]>([]);
  const [siteKeys, setSiteKeys] = useState<string[]>([]);
  const [newSiteKey, setNewSiteKey] = useState('');
  const [newAppKey, setNewAppKey] = useState('');
  // 删除二次确认
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'site' | 'app'; key: string } | null>(null);

  useEffect(() => {
    if (siteList) {
      const out: Record<string, any> = {};
      const keys: string[] = [];
      for (const row of siteList) {
        out[row.key] = row.value;
        keys.push(row.key);
      }
      setSiteDraft(out);
      setSiteKeys(keys);
    }
  }, [siteList]);

  useEffect(() => {
    if (appList) {
      const out: Record<string, any> = {};
      const keys: string[] = [];
      for (const row of appList) {
        out[row.key] = row.valueJson ?? row.value;
        keys.push(row.key);
      }
      setAppDraft(out);
      setAppKeys(keys);
    }
  }, [appList]);

  const isLoading = siteLoading || appLoading;

  // 单条 site_setting 更新 mutation
  const updateSiteKey = useApiMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      api.patch(`/api/v1/admin/cms/site-settings/${encodeURIComponent(key)}`, { valueJson: value }),
    invalidateKeys: [['cms-admin', 'site-settings-list'], ['cms', 'site-settings']],
    successMessage: '已更新 site_setting',
  });
  // 单条 app_setting 更新 mutation
  const updateAppKey = useApiMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      api.patch(`/api/v1/admin/cms/app-settings/${encodeURIComponent(key)}`, { valueJson: value }),
    invalidateKeys: [['cms-admin', 'app-settings-list'], ['cms', 'app-settings']],
    successMessage: '已更新 app_setting',
  });
  // 删除 site / app key
  const deleteSiteKey = useApiMutation({
    mutationFn: (key: string) =>
      api.delete(`/api/v1/admin/cms/site-settings/${encodeURIComponent(key)}`),
    successMessage: '已删除 site_setting',
    invalidateKeys: [['cms-admin', 'site-settings-list'], ['cms', 'site-settings']],
  });
  const deleteAppKey = useApiMutation({
    mutationFn: (key: string) =>
      api.delete(`/api/v1/admin/cms/app-settings/${encodeURIComponent(key)}`),
    successMessage: '已删除 app_setting',
    invalidateKeys: [['cms-admin', 'app-settings-list'], ['cms', 'app-settings']],
  });

  // 草稿保存(把本地 siteDraft / appDraft 全部 PATCH 一遍)
  const [savingDraft, setSavingDraft] = useState(false);
  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      // 已存在的 key → PATCH 更新;新 key → POST 创建
      const knownSite = new Set((siteList ?? []).map((r: any) => r.key));
      const knownApp = new Set((appList ?? []).map((r: any) => r.key));
      const tasks: Promise<unknown>[] = [];
      for (const [k, v] of Object.entries(siteDraft)) {
        if (knownSite.has(k)) {
          tasks.push(api.patch(`/api/v1/admin/cms/site-settings/${encodeURIComponent(k)}`, { valueJson: v }));
        } else {
          tasks.push(api.post('/api/v1/admin/cms/site-settings', { key: k, valueJson: v }));
        }
      }
      for (const [k, v] of Object.entries(appDraft)) {
        if (knownApp.has(k)) {
          tasks.push(api.patch(`/api/v1/admin/cms/app-settings/${encodeURIComponent(k)}`, { valueJson: v }));
        } else {
          tasks.push(api.post('/api/v1/admin/cms/app-settings', { key: k, valueJson: v }));
        }
      }
      await Promise.all(tasks);
      await queryClient.invalidateQueries({ queryKey: ['cms-admin'] });
      await queryClient.invalidateQueries({ queryKey: ['cms'] });
      showToast(`草稿已保存 — site ${siteKeys.length} keys / app ${appKeys.length} keys`, 'success');
    } catch (e: any) {
      showToast(`保存失败: ${e?.response?.data?.message ?? e?.message ?? '未知错误'}`, 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  const updateSiteValue = (key: string, raw: string) => {
    setSiteDraft((prev) => ({ ...prev, [key]: tryParseJson(raw) }));
  };
  const updateAppValue = (key: string, raw: string) => {
    setAppDraft((prev) => ({ ...prev, [key]: tryParseJson(raw) }));
  };

  // 新增 key 入口(只 push 到本地 draft,真正落库走"保存草稿"批量 POST/PATCH)
  const addSiteKey = () => {
    const k = newSiteKey.trim();
    if (!k) return;
    if (siteKeys.includes(k)) {
      showToast(`key "${k}" 已存在`, 'warning');
      return;
    }
    setSiteKeys((prev) => [...prev, k]);
    setSiteDraft((prev) => ({ ...prev, [k]: '' }));
    setNewSiteKey('');
  };
  const addAppKey = () => {
    const k = newAppKey.trim();
    if (!k) return;
    if (appKeys.includes(k)) {
      showToast(`key "${k}" 已存在`, 'warning');
      return;
    }
    setAppKeys((prev) => [...prev, k]);
    setAppDraft((prev) => ({ ...prev, [k]: '' }));
    setNewAppKey('');
  };

  // 单行"立即落库":只对后端已存在的 key 生效(避免新增 key 时绕开"保存草稿"批量)
  const persistSiteRow = (key: string) => {
    if (!(siteList ?? []).some((r: any) => r.key === key)) {
      showToast(`新 key "${key}" 需走"保存草稿"批量落库`, 'info');
      return;
    }
    updateSiteKey.mutate({ key, value: siteDraft[key] });
  };
  const persistAppRow = (key: string) => {
    if (!(appList ?? []).some((r: any) => r.key === key)) {
      showToast(`新 key "${key}" 需走"保存草稿"批量落库`, 'info');
      return;
    }
    updateAppKey.mutate({ key, value: appDraft[key] });
  };

  // 删除用 ConfirmDialog 二次确认
  const requestRemove = (kind: 'site' | 'app', k: string) => setPendingDelete({ kind, key: k });
  const confirmRemove = async () => {
    if (!pendingDelete) return;
    const { kind, key } = pendingDelete;
    setPendingDelete(null);
    if (kind === 'site') {
      await deleteSiteKey.mutateAsync(key);
    } else {
      await deleteAppKey.mutateAsync(key);
    }
    // 同步清掉本地 draft
    if (kind === 'site') {
      setSiteKeys((prev) => prev.filter((x) => x !== key));
      setSiteDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setAppKeys((prev) => prev.filter((x) => x !== key));
      setAppDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-black tracking-tighter uppercase">Site & App Settings</h3>
          <p className="text-xs text-[#666666] dark:text-neutral-400 mt-1">
            品牌文案(key-value)放 site_settings,业务规则(key-value)放 app_settings。逐行小保存 → PATCH 单条;保存草稿 → 批量 POST 新 key / PATCH 已有 key。
          </p>
        </div>
        <button
          onClick={handleSaveDraft}
          disabled={savingDraft}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> {savingDraft ? '保存中…' : '保存草稿'}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangle" className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Site settings */}
          <section className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-black uppercase tracking-widest">Site Settings</h4>
              <div className="flex items-center gap-2">
                <input
                  value={newSiteKey}
                  onChange={(e) => setNewSiteKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSiteKey())}
                  placeholder="新 key (e.g. brand.hero.headline)"
                  className="px-3 py-1.5 border-2 border-[#171717] dark:border-neutral-50 text-xs font-mono w-72 focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800"
                />
                <button
                  onClick={addSiteKey}
                  className="p-1.5 bg-[#171717] text-white hover:bg-[#262626] transition-colors"
                  title="新增"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            {siteKeys.length === 0 ? (
              <p className="text-xs text-[#999999] italic">暂无 site_settings。API 还没返回数据(后端未灌 seed)。</p>
            ) : (
              <div className="space-y-3">
                {siteKeys.map((k) => (
                  <div key={k} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto_auto] gap-2 items-start">
                    <code className="text-xs font-mono font-bold text-[#171717] dark:text-neutral-50 break-all pt-2">{k}</code>
                    <textarea
                      value={stringifyValue(siteDraft[k])}
                      onChange={(e) => updateSiteValue(k, e.target.value)}
                      rows={2}
                      className="px-3 py-2 border-2 border-[#171717] dark:border-neutral-50 text-xs font-mono focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 resize-none"
                    />
                    <button
                      onClick={() => persistSiteRow(k)}
                      disabled={updateSiteKey.isPending}
                      className="p-1.5 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-50"
                      title="保存此行"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => requestRemove('site', k)}
                      className="p-1.5 hover:bg-danger-100 hover:text-danger-500 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* App settings */}
          <section className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-black uppercase tracking-widest">App Settings</h4>
              <div className="flex items-center gap-2">
                <input
                  value={newAppKey}
                  onChange={(e) => setNewAppKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAppKey())}
                  placeholder="新 key (e.g. duration_buckets)"
                  className="px-3 py-1.5 border-2 border-[#171717] dark:border-neutral-50 text-xs font-mono w-72 focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800"
                />
                <button
                  onClick={addAppKey}
                  className="p-1.5 bg-[#171717] text-white hover:bg-[#262626] transition-colors"
                  title="新增"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            {appKeys.length === 0 ? (
              <p className="text-xs text-[#999999] italic">暂无 app_settings。API 还没返回数据(后端未灌 seed)。</p>
            ) : (
              <div className="space-y-3">
                {appKeys.map((k) => (
                  <div key={k} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto_auto] gap-2 items-start">
                    <code className="text-xs font-mono font-bold text-[#171717] dark:text-neutral-50 break-all pt-2">{k}</code>
                    <textarea
                      value={stringifyValue(appDraft[k])}
                      onChange={(e) => updateAppValue(k, e.target.value)}
                      rows={2}
                      className="px-3 py-2 border-2 border-[#171717] dark:border-neutral-50 text-xs font-mono focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 resize-none"
                    />
                    <button
                      onClick={() => persistAppRow(k)}
                      disabled={updateAppKey.isPending}
                      className="p-1.5 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-50"
                      title="保存此行"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => requestRemove('app', k)}
                      className="p-1.5 hover:bg-danger-100 hover:text-danger-500 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
        title={`确认删除 ${pendingDelete?.kind === 'site' ? 'site' : 'app'}_setting?`}
        description={
          pendingDelete
            ? `key "${pendingDelete.key}" 删除后不可恢复,前端 useSetting / useSiteSettings 会自动失效该 key。`
            : ''
        }
        variant="danger"
        confirmText="确认删除"
      />
    </div>
  );
}

function tryParseJson(raw: string): any {
  if (raw.trim() === '') return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function stringifyValue(v: any): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}

// =============================================================
// Tab 2: 页面文案(page_settings)
// =============================================================
function PageSettingsTab() {
  const { showToast } = useToast();
  const PAGES = ['home', 'courses', 'degrees', 'hackathons', 'auth', 'dashboard'];
  const [page, setPage] = useState<string>('home');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cms-admin', 'page-settings-list'],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/api/v1/admin/cms/page-settings');
      return Array.isArray(data) ? data : (data as any)?.data ?? [];
    },
    retry: 0,
  });

  const rows = (data ?? []).filter((row: any) => row.page === page);
  const availablePages = Array.from(new Set([...PAGES, ...(data ?? []).map((row: any) => row.page)]));

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of rows) next[row.key] = stringifyValue(row.value);
    setDrafts(next);
  }, [data, page]);

  const updateSetting = useApiMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.patch(
        `/api/v1/admin/cms/page-settings/${encodeURIComponent(`${page}:${key}`)}`,
        { valueJson: value },
      ),
    successMessage: '页面文案已更新',
    invalidateKeys: [['cms-admin', 'page-settings-list'], ['cms', 'page-settings']],
  });
  const createSetting = useApiMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.post('/api/v1/admin/cms/page-settings', { page, key, valueJson: value }),
    successMessage: '页面文案已新增',
    invalidateKeys: [['cms-admin', 'page-settings-list'], ['cms', 'page-settings']],
    onSuccess: () => {
      setNewKey('');
      setNewValue('');
    },
  });
  const deleteSetting = useApiMutation({
    mutationFn: (key: string) =>
      api.delete(`/api/v1/admin/cms/page-settings/${encodeURIComponent(`${page}:${key}`)}`),
    successMessage: '页面文案已删除',
    invalidateKeys: [['cms-admin', 'page-settings-list'], ['cms', 'page-settings']],
  });

  const handleCreate = () => {
    const key = newKey.trim();
    if (!key) return;
    if (key.includes(':')) {
      showToast('key 不能包含冒号', 'error');
      return;
    }
    if (rows.some((row: any) => row.key === key)) {
      showToast(`key "${key}" 已存在`, 'warning');
      return;
    }
    createSetting.mutate({ key, value: tryParseJson(newValue) });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const key = pendingDelete;
    setPendingDelete(null);
    await deleteSetting.mutateAsync(key);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-black tracking-tighter uppercase">Page Settings</h3>
          <p className="text-xs text-[#666666] dark:text-neutral-400 mt-1">按 page 路由分组,key 形如 <code className="bg-[#EEEDE9] dark:bg-neutral-800 px-1">home.hero.headline</code></p>
        </div>
        <select
          value={page}
          onChange={(e) => setPage(e.target.value)}
          className="px-3 py-2 border-2 border-[#171717] dark:border-neutral-50 text-xs font-black uppercase tracking-widest bg-white dark:bg-neutral-100"
        >
          {availablePages.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <section className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100 p-5 space-y-4">
        <div className="grid gap-2 md:grid-cols-[220px_1fr_auto]">
          <input
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            placeholder="section.field"
            maxLength={100}
            className="px-3 py-2 border-2 border-[#171717] text-xs font-mono"
          />
          <textarea
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            placeholder="文案或合法 JSON 值"
            rows={2}
            className="px-3 py-2 border-2 border-[#171717] text-xs font-mono resize-none"
          />
          <button
            onClick={handleCreate}
            disabled={!newKey.trim() || createSetting.isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#171717] text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> 新增
          </button>
        </div>
      </section>

      {isLoading ? (
        <Skeleton variant="rectangle" className="h-32 w-full" />
      ) : isError ? (
        <div className="border-2 border-danger-500 p-6 text-sm text-danger-500">页面文案加载失败，请刷新重试。</div>
      ) : rows.length === 0 ? (
        <div className="border-2 border-dashed border-[#171717] p-8 text-sm text-[#666666] text-center">
          当前页面暂无自定义文案，可使用上方表单新增。
        </div>
      ) : (
        <section className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100 p-5 space-y-3">
          {rows.map((row: any) => (
            <div key={row.key} className="grid gap-2 md:grid-cols-[220px_1fr_auto_auto] items-start">
              <div className="pt-2 min-w-0">
                <code className="text-xs font-bold break-all">{row.key}</code>
                {row.description && <p className="text-[10px] text-[#666666] mt-1">{row.description}</p>}
              </div>
              <textarea
                value={drafts[row.key] ?? ''}
                onChange={(event) => setDrafts((current) => ({ ...current, [row.key]: event.target.value }))}
                rows={2}
                className="px-3 py-2 border-2 border-[#171717] text-xs font-mono resize-y"
              />
              <button
                onClick={() => updateSetting.mutate({ key: row.key, value: tryParseJson(drafts[row.key] ?? '') })}
                disabled={updateSetting.isPending}
                className="p-2 hover:bg-[#171717] hover:text-white disabled:opacity-50"
                title="保存此行"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPendingDelete(row.key)}
                disabled={deleteSetting.isPending}
                className="p-2 hover:bg-danger-100 hover:text-danger-500 disabled:opacity-50"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </section>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="确认删除页面文案？"
        description={pendingDelete ? `${page}.${pendingDelete} 删除后将恢复代码中的默认文案。` : ''}
        variant="danger"
        confirmText="确认删除"
      />
    </div>
  );
}

// =============================================================
// Tab 3: 枚举(enum_translations)
//
// P2-3b 接真后端:3 个 mutation(create / update / delete) +
// 启用"新增 value" / 行内 Edit2 / Trash2。
// 复合主键 id 形如 "enumType:enumValue:locale",走 admin controller。
// =============================================================
const ENUM_TYPES = [
  'course_level', 'cost_type', 'order_status', 'hackathon_status',
  'submission_status', 'user_role', 'notification_type',
  'course_status', 'course_type', 'resource_type', 'oauth_provider',
  'search_result_type', 'progress_status',
];

const ENUM_LOCALE = 'zh-CN';

function EnumsTab() {
  const { showToast } = useToast();
  const [filterType, setFilterType] = useState<string>('order_status');
  // 拉 admin list(支持 type/locale filter)
  const { data, isLoading } = useQuery({
    queryKey: ['cms-admin', 'enum-list', filterType, ENUM_LOCALE],
    queryFn: async () => {
      const { data } = await api.get<any[]>('/api/v1/admin/cms/enum-translations', {
        params: { type: filterType, locale: ENUM_LOCALE },
      });
      return Array.isArray(data) ? data : (data as any)?.data ?? [];
    },
    retry: 0,
  });
  // 转成 EnumItem 形状
  const items: EnumItem[] = (data ?? []).map((row: any) => ({
    value: row.enumValue ?? row.value,
    label: row.label,
    colorClass: row.colorClass ?? undefined,
    icon: row.icon ?? undefined,
    sortOrder: row.sortOrder,
  }));
  const effective: EnumItem[] = items;

  // 新增 / 更新 / 删除 mutations
  const createEnum = useApiMutation({
    mutationFn: (payload: { enumValue: string; label: string; colorClass?: string; icon?: string; sortOrder?: number }) =>
      api.post('/api/v1/admin/cms/enum-translations', {
        enumType: filterType,
        locale: ENUM_LOCALE,
        ...payload,
      }),
    successMessage: '已新增 enum value',
    invalidateKeys: [['cms-admin', 'enum-list'], ['cms', 'enum']],
  });
  const updateEnum = useApiMutation({
    mutationFn: ({ value, payload }: { value: string; payload: { label: string; colorClass?: string; icon?: string; sortOrder?: number } }) =>
      api.patch(`/api/v1/admin/cms/enum-translations/${encodeURIComponent(`${filterType}:${value}:${ENUM_LOCALE}`)}`, payload),
    successMessage: '已更新 enum value',
    invalidateKeys: [['cms-admin', 'enum-list'], ['cms', 'enum']],
  });
  const deleteEnum = useApiMutation({
    mutationFn: (value: string) =>
      api.delete(`/api/v1/admin/cms/enum-translations/${encodeURIComponent(`${filterType}:${value}:${ENUM_LOCALE}`)}`),
    successMessage: '已删除 enum value',
    invalidateKeys: [['cms-admin', 'enum-list'], ['cms', 'enum']],
  });

  // 行内编辑
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; colorClass: string; icon: string; sortOrder: number }>({
    label: '',
    colorClass: '',
    icon: '',
    sortOrder: 0,
  });
  const beginEdit = (it: EnumItem) => {
    setEditingValue(it.value);
    setDraft({
      label: it.label,
      colorClass: it.colorClass ?? '',
      icon: it.icon ?? '',
      sortOrder: it.sortOrder ?? 0,
    });
  };
  const cancelEdit = () => {
    setEditingValue(null);
  };
  const saveEdit = () => {
    if (!editingValue) return;
    updateEnum.mutate(
      {
        value: editingValue,
        payload: {
          label: draft.label,
          colorClass: draft.colorClass || undefined,
          icon: draft.icon || undefined,
          sortOrder: Number(draft.sortOrder) || 0,
        },
      },
      { onSuccess: () => cancelEdit() },
    );
  };

  // 新增 row state
  const [creating, setCreating] = useState(false);
  const [newRow, setNewRow] = useState({ value: '', label: '', colorClass: '', icon: '', sortOrder: 0 });
  const startCreate = () => {
    setCreating(true);
    setNewRow({ value: '', label: '', colorClass: '', icon: '', sortOrder: effective.length + 1 });
  };
  const cancelCreate = () => {
    setCreating(false);
    setNewRow({ value: '', label: '', colorClass: '', icon: '', sortOrder: 0 });
  };
  const submitCreate = () => {
    const v = newRow.value.trim();
    if (!v || !newRow.label.trim()) {
      showToast('value 和 label 必填', 'warning');
      return;
    }
    createEnum.mutate(
      {
        enumValue: v,
        label: newRow.label.trim(),
        colorClass: newRow.colorClass || undefined,
        icon: newRow.icon || undefined,
        sortOrder: Number(newRow.sortOrder) || 0,
      },
      { onSuccess: () => cancelCreate() },
    );
  };

  // 删除 confirm
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const v = pendingDelete;
    setPendingDelete(null);
    await deleteEnum.mutateAsync(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-black tracking-tighter uppercase">Enum Translations</h3>
          <p className="text-xs text-[#666666] dark:text-neutral-400 mt-1">
            枚举的 i18n label + color + icon。共 {ENUM_TYPES.length} 种。修改后前端 useEnum 立即刷新。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setEditingValue(null);
              setCreating(false);
            }}
            className="px-3 py-2 border-2 border-[#171717] dark:border-neutral-50 text-xs font-black uppercase tracking-widest bg-white dark:bg-neutral-100"
          >
            {ENUM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            onClick={creating ? cancelCreate : startCreate}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
            title="新增 enum value"
          >
            {creating ? <><X className="w-3.5 h-3.5" /> 取消</> : <><Plus className="w-3.5 h-3.5" /> 新增 value</>}
          </button>
        </div>
      </div>
      {isLoading ? (
        <Skeleton variant="rectangle" className="h-48 w-full" />
      ) : (
        <div className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100">
          <div className="grid grid-cols-12 gap-3 p-3 border-b-2 border-[#171717] dark:border-neutral-50 text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400">
            <div className="col-span-2">value</div>
            <div className="col-span-3">label (zh-CN)</div>
            <div className="col-span-4">colorClass</div>
            <div className="col-span-1">icon</div>
            <div className="col-span-1">order</div>
            <div className="col-span-1 text-right">action</div>
          </div>
          {effective.length === 0 ? (
            <div className="p-6 text-center text-sm text-[#999999] italic">无数据</div>
          ) : (
            <>
              {creating && (
                <div className="grid grid-cols-12 gap-3 p-3 items-start text-sm border-b border-[#EEEDE9] bg-[#F5F4F0] dark:bg-neutral-800">
                  <div className="col-span-2">
                    <input
                      value={newRow.value}
                      onChange={(e) => setNewRow({ ...newRow, value: e.target.value })}
                      placeholder="Beginner"
                      className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      value={newRow.label}
                      onChange={(e) => setNewRow({ ...newRow, label: e.target.value })}
                      placeholder="入门"
                      className="w-full px-2 py-1 border-2 border-[#171717] text-xs"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      value={newRow.colorClass}
                      onChange={(e) => setNewRow({ ...newRow, colorClass: e.target.value })}
                      placeholder="border border-[#171717] text-[#171717]"
                      className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      value={newRow.icon}
                      onChange={(e) => setNewRow({ ...newRow, icon: e.target.value })}
                      placeholder="graduation"
                      className="w-full px-2 py-1 border-2 border-[#171717] text-xs"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="number"
                      value={newRow.sortOrder}
                      onChange={(e) => setNewRow({ ...newRow, sortOrder: Number(e.target.value) })}
                      className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <button
                      onClick={submitCreate}
                      disabled={createEnum.isPending}
                      className="p-1.5 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-50"
                      title="保存"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              {effective.map((it) => {
                const isEditing = editingValue === it.value;
                return (
                  <div
                    key={it.value}
                    className={cn(
                      'grid grid-cols-12 gap-3 p-3 items-center text-sm border-b border-[#EEEDE9] last:border-0',
                      isEditing ? 'bg-[#F5F4F0] dark:bg-neutral-800' : 'hover:bg-[#F5F4F0] dark:hover:bg-neutral-800',
                    )}
                  >
                    <div className="col-span-2 font-mono text-xs font-bold">{it.value}</div>
                    {isEditing ? (
                      <>
                        <div className="col-span-3">
                          <input
                            value={draft.label}
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                            className="w-full px-2 py-1 border-2 border-[#171717] text-xs"
                          />
                        </div>
                        <div className="col-span-4">
                          <input
                            value={draft.colorClass}
                            onChange={(e) => setDraft({ ...draft, colorClass: e.target.value })}
                            className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono"
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            value={draft.icon}
                            onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                            className="w-full px-2 py-1 border-2 border-[#171717] text-xs"
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            type="number"
                            value={draft.sortOrder}
                            onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                            className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono"
                          />
                        </div>
                        <div className="col-span-1 flex items-center justify-end gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={updateEnum.isPending}
                            className="p-1.5 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-50"
                            title="保存"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 hover:bg-[#171717] hover:text-white transition-colors"
                            title="取消"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-3">{it.label}</div>
                        <div className="col-span-4 font-mono text-[10px] text-[#666666] dark:text-neutral-400 break-all">
                          {it.colorClass ?? '—'}
                        </div>
                        <div className="col-span-1 text-xs text-[#666666] dark:text-neutral-400">
                          {it.icon ?? '—'}
                        </div>
                        <div className="col-span-1 text-xs text-[#666666] dark:text-neutral-400">
                          {it.sortOrder ?? 0}
                        </div>
                        <div className="col-span-1 flex items-center justify-end gap-1">
                          <button
                            onClick={() => beginEdit(it)}
                            className="p-1.5 hover:bg-[#171717] hover:text-white transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setPendingDelete(it.value)}
                            className="p-1.5 hover:bg-danger-100 hover:text-danger-500 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
      <p className="text-[10px] text-[#999999]">
        此处直接展示数据库记录；接口失败会显示真实错误，不会用前端静态数据伪装成功。
      </p>
      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="确认删除该 enum value?"
        description={
          pendingDelete
            ? `value "${pendingDelete}" 删除后,前端 useEnum 立即失效该 enum。`
            : ''
        }
        variant="danger"
        confirmText="确认删除"
      />
    </div>
  );
}

// =============================================================
// Tab 4-13: 10 个 list resource 的通用 CRUD 组件
// =============================================================
//
// list tab (testimonials / quick-prompts / course-categories /
// popular-searches / hot-keywords / auth-providers /
// top-nav / footer-columns) 都有相同的 CRUD pattern:
//   - GET /api/v1/admin/cms/<resource> 拉 list
//   - POST /api/v1/admin/cms/<resource> 新增
//   - PATCH /api/v1/admin/cms/<resource>/:id 更新
//   - DELETE /api/v1/admin/cms/<resource>/:id 删除
//   - 都有 id + isActive + orderIndex, 其它字段随 resource 变
//
// 通用 ListCrudTab 接 resource 名 + 字段定义,渲染统一 brutalist 表格 + edit form.
// 简化: Json 字段用 textarea + JSON.parse; boolean 用 checkbox; number 用 input type=number.

interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'json' | 'boolean' | 'number';
  required?: boolean;
  hint?: string;
}

interface ListCrudTabProps {
  resource: string;        // e.g. "testimonials"
  displayName: string;     // e.g. "Testimonials"
  fields: FieldDef[];      // 渲染哪些列 + form 哪些字段
  // 可选: 额外的"显示名"列(从 data 里取)
  primaryKey?: string;      // 显示在表格第一列, 默认 'id' 前 8 位
}

function ListCrudTab({ resource, displayName, fields, primaryKey = 'id' }: ListCrudTabProps) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['cms-admin', 'list', resource],
    queryFn: async () => {
      const { data } = await api.get<any[]>(`/api/v1/admin/cms/${resource}`);
      return data ?? [];
    },
    retry: 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [creating, setCreating] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, any>>({});

  const beginEdit = (item: any) => {
    setEditingId(item.id);
    setDraft({ ...item });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };
  const beginCreate = () => {
    setCreating(true);
    const empty: Record<string, any> = { isActive: true, orderIndex: (items?.length ?? 0) + 1 };
    fields.forEach((f) => { empty[f.name] = f.type === 'json' ? '' : f.type === 'boolean' ? false : ''; });
    setNewRow(empty);
  };
  const cancelCreate = () => {
    setCreating(false);
    setNewRow({});
  };

  // P2-3c: 接 useApiMutation,自动 toast / invalidate
  const updateMutation = useApiMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, any> }) =>
      api.patch(`/api/v1/admin/cms/${resource}/${id}`, payload),
    successMessage: `${displayName} 已更新`,
    invalidateKeys: [['cms-admin', 'list', resource], ['cms', 'list', resource]],
    onSuccess: () => cancelEdit(),
  });
  const createMutation = useApiMutation({
    mutationFn: (payload: Record<string, any>) =>
      api.post(`/api/v1/admin/cms/${resource}`, payload),
    successMessage: `${displayName} 已新增`,
    invalidateKeys: [['cms-admin', 'list', resource], ['cms', 'list', resource]],
    onSuccess: () => cancelCreate(),
  });
  const deleteMutation = useApiMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/v1/admin/cms/${resource}/${id}`),
    successMessage: `${displayName} 已删除`,
    invalidateKeys: [['cms-admin', 'list', resource], ['cms', 'list', resource]],
  });
  const toggleMutation = useApiMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/api/v1/admin/cms/${resource}/${id}`, { isActive }),
    errorMessage: '切换失败',
    invalidateKeys: [['cms-admin', 'list', resource], ['cms', 'list', resource]],
  });

  const saveEdit = () => {
    if (!editingId) return;
    // DTOs reject immutable/read-only Prisma fields (id, timestamps). Keep the
    // generic editor aligned with the auth-provider contract as well.
    const payload = Object.fromEntries([
      ...fields.filter((field) => field.name !== 'id').map((field) => [field.name, draft[field.name]]),
      ['isActive', draft.isActive],
      ['orderIndex', draft.orderIndex],
    ].filter(([, value]) => value !== undefined));
    updateMutation.mutate({ id: editingId, payload });
  };
  const createRow = () => {
    createMutation.mutate(newRow);
  };
  // 删除走 ConfirmDialog(controlled 二次确认)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const requestRemove = (id: string) => setPendingDeleteId(id);
  const confirmRemove = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    await deleteMutation.mutateAsync(id);
  };
  const toggleActive = (item: any) => {
    toggleMutation.mutate({ id: item.id, isActive: !item.isActive });
  };

  const updateDraft = (key: string, val: any) => setDraft((p) => ({ ...p, [key]: val }));
  const updateNew = (key: string, val: any) => setNewRow((p) => ({ ...p, [key]: val }));

  // 渲染 cell (read mode)
  const renderReadCell = (item: any, field: FieldDef): string => {
    const v = item[field.name];
    if (v === null || v === undefined) return '—';
    if (field.type === 'boolean') return v ? '✓' : '✗';
    if (field.type === 'json') return Array.isArray(v) ? `[${v.length} items]` : JSON.stringify(v).slice(0, 40);
    if (typeof v === 'string' && v.length > 40) return v.slice(0, 40) + '...';
    return String(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-black tracking-tighter uppercase">{displayName}</h3>
          <p className="text-xs text-[#666666] dark:text-neutral-400 mt-1">
            CRUD: GET / POST / PATCH / DELETE /api/v1/admin/cms/{resource}
          </p>
        </div>
        <button
          onClick={creating ? cancelCreate : beginCreate}
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] disabled:opacity-50 transition-colors"
        >
          {creating ? <><X className="w-3.5 h-3.5" /> 取消</> : <><Plus className="w-3.5 h-3.5" /> 新增</>}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangle" className="h-10 w-full" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <p className="text-xs text-[#999999] italic">暂无 {displayName}。</p>
      ) : (
        <div className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#171717] text-white">
              <tr>
                <th className="px-3 py-2 text-left font-black uppercase tracking-widest">{primaryKey}</th>
                {fields.map((f) => (
                  <th key={f.name} className="px-3 py-2 text-left font-black uppercase tracking-widest">{f.label}</th>
                ))}
                <th className="px-3 py-2 text-left font-black uppercase tracking-widest">排序</th>
                <th className="px-3 py-2 text-left font-black uppercase tracking-widest">启用</th>
                <th className="px-3 py-2 text-right font-black uppercase tracking-widest">操作</th>
              </tr>
            </thead>
            <tbody>
              {creating && (
                <tr className="bg-[#F5F4F0] dark:bg-neutral-800">
                  <td className="px-3 py-2 font-mono text-[#999999]">新</td>
                  {fields.map((f) => (
                    <td key={f.name} className="px-3 py-2">
                      {renderFormField(newRow, f, (v) => updateNew(f.name, v))}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={newRow.orderIndex ?? 0}
                      onChange={(e) => updateNew('orderIndex', Number(e.target.value))}
                      className="w-16 px-2 py-1 border-2 border-[#171717] text-xs font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!newRow.isActive}
                      onChange={(e) => updateNew('isActive', e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={createRow}
                      disabled={createMutation.isPending}
                      className="p-1 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-50"
                      title="保存"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )}
              {items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id} className={isEditing ? 'bg-[#F5F4F0] dark:bg-neutral-800' : 'hover:bg-[#F5F4F0] dark:hover:bg-neutral-800'}>
                    <td className="px-3 py-2 font-mono text-[10px] text-[#666666]">{item[primaryKey]?.toString().slice(0, 8) ?? item.id.slice(0, 8)}</td>
                    {fields.map((f) => (
                      <td key={f.name} className="px-3 py-2">
                        {isEditing ? renderFormField(draft, f, (v) => updateDraft(f.name, v)) : renderReadCell(item, f)}
                      </td>
                    ))}
                    <td className="px-3 py-2 font-mono">
                      {isEditing ? (
                        <input
                          type="number"
                          value={draft.orderIndex ?? 0}
                          onChange={(e) => updateDraft('orderIndex', Number(e.target.value))}
                          className="w-16 px-2 py-1 border-2 border-[#171717] text-xs font-mono"
                        />
                      ) : item.orderIndex}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleActive(item)}
                        disabled={toggleMutation.isPending}
                        className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 disabled:opacity-50 ${item.isActive !== false ? 'bg-[#171717] text-white border-[#171717]' : 'border-[#171717] text-[#171717]'}`}
                      >
                        {item.isActive !== false ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} disabled={updateMutation.isPending} className="p-1 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-50" title="保存">
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={cancelEdit} className="p-1 hover:bg-[#171717] hover:text-white transition-colors" title="取消">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => beginEdit(item)} className="p-1 hover:bg-[#171717] hover:text-white transition-colors" title="编辑">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => requestRemove(item.id)} className="p-1 hover:bg-danger-100 hover:text-danger-500 transition-colors" title="删除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={confirmRemove}
        title={`确认删除该 ${displayName}?`}
        description="删除后不可恢复,前端 useList 会立即移除该条。"
        variant="danger"
        confirmText="确认删除"
      />
    </div>
  );
}

function renderFormField(state: Record<string, any>, field: FieldDef, setVal: (v: any) => void) {
  const v = state[field.name];
  if (field.type === 'textarea') {
    return (
      <textarea
        value={v ?? ''}
        onChange={(e) => setVal(e.target.value)}
        rows={2}
        className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono resize-none min-w-[160px]"
      />
    );
  }
  if (field.type === 'json') {
    return (
      <textarea
        value={v === null || v === undefined ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2))}
        onChange={(e) => {
          const raw = e.target.value;
          try { setVal(raw.trim() === '' ? null : JSON.parse(raw)); }
          catch { setVal(raw); /* 保留 raw, 等用户修 */ }
        }}
        rows={3}
        placeholder='JSON 数组 / 对象, 例: [{"key":"value"}] 或 {"k":"v"}'
        className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono resize-none min-w-[200px]"
      />
    );
  }
  if (field.type === 'boolean') {
    return <input type="checkbox" checked={!!v} onChange={(e) => setVal(e.target.checked)} />;
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={v ?? 0}
        onChange={(e) => setVal(Number(e.target.value))}
        className="w-24 px-2 py-1 border-2 border-[#171717] text-xs font-mono"
      />
    );
  }
  // text
  return (
    <input
      type="text"
      value={v ?? ''}
      onChange={(e) => setVal(e.target.value)}
      className="w-full px-2 py-1 border-2 border-[#171717] text-xs font-mono min-w-[120px]"
    />
  );
}

// =============================================================
// 主组件
// =============================================================
export function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('global');

  return (
    <div>
      <PageHeader activeTab={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'global' && <GlobalSettingsTab />}
        {activeTab === 'page' && <PageSettingsTab />}
        {activeTab === 'enums' && <EnumsTab />}
        {activeTab === 'testimonials' && (
          <ListCrudTab
            resource="testimonials"
            displayName="Testimonials"
            fields={[
              { name: 'name', label: '姓名', type: 'text', required: true },
              { name: 'title', label: '身份', type: 'text' },
              { name: 'quote', label: '感言', type: 'textarea', required: true },
              { name: 'avatar', label: 'Avatar', type: 'text' },
            ]}
          />
        )}
        {activeTab === 'quick_prompts' && (
          <ListCrudTab
            resource="quick-prompts"
            displayName="Quick Prompts"
            primaryKey="label"
            fields={[
              { name: 'emoji', label: 'Emoji', type: 'text' },
              { name: 'label', label: '显示 label', type: 'text', required: true },
              { name: 'promptText', label: '实际 prompt', type: 'textarea', required: true },
              { name: 'scope', label: 'Scope', type: 'text' },
            ]}
          />
        )}
        {activeTab === 'course_categories' && (
          <ListCrudTab
            resource="course-categories"
            displayName="Course Categories"
            primaryKey="key"
            fields={[
              { name: 'key', label: 'Key', type: 'text', required: true },
              { name: 'label', label: 'Label', type: 'text', required: true },
            ]}
          />
        )}
        {activeTab === 'searches' && (
          <div className="space-y-6">
            <ListCrudTab
              resource="popular-searches"
              displayName="Popular Searches"
              primaryKey="keyword"
              fields={[
                { name: 'keyword', label: '关键词', type: 'text', required: true },
                { name: 'clickCount', label: '点击数', type: 'number' },
              ]}
            />
            <ListCrudTab
              resource="hot-keywords"
              displayName="Hot Keywords"
              primaryKey="keyword"
              fields={[
                { name: 'keyword', label: '关键词', type: 'text', required: true },
                { name: 'scope', label: 'Scope', type: 'text' },
              ]}
            />
          </div>
        )}
        {activeTab === 'auth_providers' && (
          <div className="space-y-4">
            <div className="border-2 border-amber-600 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>登录方式说明：</strong> 环境变量决定登录能力和 OAuth 密钥；这里仅管理已配置登录方式的显示名称、图标和启用状态。启用 Google/GitHub 前，仍需先在 API 环境中配置对应 provider。
            </div>
            <ListCrudTab
              resource="auth-providers"
              displayName="Auth Providers"
            primaryKey="id"
              fields={[
                { name: 'id', label: 'ID (e.g. google)', type: 'text', required: true },
                { name: 'label', label: 'Label', type: 'text', required: true },
                { name: 'icon', label: 'Icon (lucide)', type: 'text' },
              ]}
            />
          </div>
        )}
        {activeTab === 'navigation' && (
          <div className="space-y-6">
            <ListCrudTab
              resource="top-nav"
              displayName="Top Nav"
              primaryKey="label"
              fields={[
                { name: 'label', label: 'Label', type: 'text', required: true },
                { name: 'path', label: 'Path', type: 'text', required: true },
                { name: 'icon', label: 'Icon (lucide)', type: 'text' },
              ]}
            />
            <ListCrudTab
              resource="footer-columns"
              displayName="Footer Columns"
              primaryKey="title"
              fields={[
                { name: 'title', label: 'Title', type: 'text', required: true },
                { name: 'links', label: 'Links (JSON array)', type: 'json' },
              ]}
            />
          </div>
        )}
        {activeTab === 'i18n' && (
          <ListCrudTab
            resource="i18n/messages"
            displayName="i18n Messages"
            primaryKey="key"
            fields={[
              { name: 'key', label: 'Key', type: 'text', required: true },
              { name: 'locale', label: 'Locale', type: 'text', required: true },
              { name: 'value', label: 'Value', type: 'textarea', required: true },
              { name: 'category', label: 'Category', type: 'text' },
            ]}
          />
        )}
        {activeTab === 'date_formats' && (
          <ListCrudTab
            resource="date-format-templates"
            displayName="Date Format Templates"
            primaryKey="scope"
            fields={[
              { name: 'scope', label: 'Scope', type: 'text', required: true },
              { name: 'locale', label: 'Locale', type: 'text', required: true },
              { name: 'template', label: 'Template', type: 'text', required: true },
            ]}
          />
        )}
      </div>
    </div>
  );
}
