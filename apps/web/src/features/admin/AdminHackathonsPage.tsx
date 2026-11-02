import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Edit2, FileText, ListChecks, Plus, Rocket, Save, Trophy, Users, X } from 'lucide-react';
import type { HackathonStatus } from '@secondplanet/shared-types';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { HackathonStatusBadge } from '../hackathons/HackathonStatusBadge';
import { useApiMutation } from '../../hooks/useApiMutation';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FileUploadButton } from '../../components/admin/FileUploadButton';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import { useToast } from '../../components/auth/Toast';
import { RegistrationFormBuilder, validateRegistrationFields } from './hackathons/RegistrationFormBuilder';
import { RegistrationsPanel } from './hackathons/RegistrationsPanel';
import { SubmissionsPanel } from './hackathons/SubmissionsPanel';
import { JudgesSponsorsPanel } from './hackathons/JudgesSponsorsPanel';
import { Field, Panel, Select, actionButtonClass, outlineButtonClass } from './hackathons/ui';
import type { AdminHackathon, RegistrationField, RegistrationMode } from './hackathons/types';

const STATUS_OPTIONS: HackathonStatus[] = ['upcoming', 'active', 'judging', 'finished', 'cancelled'];
const STATUS_LABELS: Record<HackathonStatus, string> = {
  upcoming: '报名中', active: '进行中', judging: '评审中', finished: '已结束', cancelled: '已取消',
};
const WORKSPACES = [
  { key: 'basic', label: '基础信息', icon: FileText },
  { key: 'registration', label: '报名表', icon: ListChecks },
  { key: 'registrations', label: '报名审核', icon: ListChecks },
  { key: 'submissions', label: '作品评审', icon: Trophy },
  { key: 'people', label: '评委与赞助商', icon: Users },
] as const;
type Workspace = (typeof WORKSPACES)[number]['key'];

function toDateTimeLocal(iso?: string | Date | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toISOString(local?: string) {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function emptyForm() {
  return {
    title: '', description: '', bannerUrl: '', status: 'upcoming' as HackathonStatus,
    startDate: '', endDate: '', registerDeadline: '', submissionDeadline: '',
    minTeamSize: 1, maxTeamSize: 5, location: '', rules: '', submissionRequirements: '', prizes: '',
    registrationMode: 'internal' as RegistrationMode, registrationFields: [] as RegistrationField[],
    registrationUrl: '', registrationLabel: '',
  };
}

export function AdminHackathonsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>('basic');
  const [form, setForm] = useState(emptyForm);
  const [pendingCancel, setPendingCancel] = useState<AdminHackathon | null>(null);
  const editId = searchParams.get('edit') ?? useParams<{ id: string }>().id ?? null;

  const { data: hackathons, isLoading } = useQuery({
    queryKey: ['admin-hackathons'],
    queryFn: () => hackathonsApi.getAll(),
  });

  useEffect(() => {
    if (editId && hackathons) {
      const hackathon = hackathons.find((item) => item.id === editId);
      if (hackathon) startEdit(hackathon);
      setSearchParams({}, { replace: true });
    }
  }, [editId, hackathons, setSearchParams]);

  const createMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) => hackathonsApi.create(payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['admin-hackathons'] });
      queryClient.invalidateQueries({ queryKey: ['hackathons'] });
      startEdit(created);
      showToast('黑客松已创建，可继续配置报名和评审', 'success');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => showToast(error?.response?.data?.message ?? '创建失败', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReturnType<typeof buildPayload> }) => hackathonsApi.update(id, payload),
    onSuccess: (updated, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-hackathons'] });
      queryClient.invalidateQueries({ queryKey: ['hackathons'] });
      queryClient.invalidateQueries({ queryKey: ['hackathon', id] });
      startEdit(updated);
      showToast('黑客松设置已保存', 'success');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => showToast(error?.response?.data?.message ?? '保存失败', 'error'),
  });

  const cancelMutation = useApiMutation({
    mutationFn: (id: string) => hackathonsApi.update(id, { status: 'cancelled' }),
    successMessage: '黑客松已取消，报名与作品记录已保留',
    invalidateKeys: [['admin-hackathons'], ['hackathons']],
    onSuccess: (_, id) => {
      if (editingId === id) setForm((current) => ({ ...current, status: 'cancelled' }));
    },
  });

  function startEdit(hackathon: AdminHackathon) {
    setEditingId(hackathon.id);
    setIsCreating(true);
    setWorkspace('basic');
    setForm({
      title: hackathon.title,
      description: hackathon.description,
      bannerUrl: hackathon.bannerUrl || '',
      status: hackathon.status,
      startDate: toDateTimeLocal(hackathon.startDate),
      endDate: toDateTimeLocal(hackathon.endDate),
      registerDeadline: toDateTimeLocal(hackathon.registerDeadline),
      submissionDeadline: toDateTimeLocal(hackathon.submissionDeadline),
      minTeamSize: hackathon.minTeamSize,
      maxTeamSize: hackathon.maxTeamSize,
      location: hackathon.location || '',
      rules: hackathon.rules || '',
      submissionRequirements: hackathon.submissionRequirements || '',
      prizes: hackathon.prizes || '',
      registrationMode: hackathon.registrationMode ?? (hackathon.registrationUrl ? 'external' : 'internal'),
      registrationFields: (hackathon.registrationFields ?? []).map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })),
      registrationUrl: hackathon.registrationUrl || '',
      registrationLabel: hackathon.registrationLabel || '',
    });
  }

  function resetForm() {
    setEditingId(null);
    setIsCreating(false);
    setWorkspace('basic');
    setForm(emptyForm());
  }

  function buildPayload() {
    return {
      ...form,
      startDate: toISOString(form.startDate)!,
      endDate: toISOString(form.endDate)!,
      registerDeadline: toISOString(form.registerDeadline) || null,
      submissionDeadline: toISOString(form.submissionDeadline) || null,
      minTeamSize: Number(form.minTeamSize),
      maxTeamSize: Number(form.maxTeamSize),
    };
  }

  function handleSave() {
    if (!form.title.trim() || !form.description.trim()) {
      showToast('请填写标题和活动介绍', 'error');
      return;
    }
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      showToast('请填写有效时间，结束时间必须晚于开始时间', 'error');
      return;
    }
    if (form.minTeamSize > form.maxTeamSize) {
      showToast('最小团队人数不能大于最大团队人数', 'error');
      return;
    }
    if (form.registerDeadline && new Date(form.registerDeadline) > start) {
      showToast('报名截止时间不能晚于活动开始时间', 'error');
      return;
    }
    if (form.submissionDeadline && (new Date(form.submissionDeadline) < start || new Date(form.submissionDeadline) > end)) {
      showToast('作品提交截止时间必须位于活动周期内', 'error');
      return;
    }
    if (form.registrationMode === 'external' && !form.registrationUrl.trim()) {
      showToast('外部报名方式需要填写外链 URL', 'error');
      return;
    }
    const fieldError = validateRegistrationFields(form.registrationFields);
    if (form.registrationMode === 'internal' && fieldError) {
      showToast(fieldError, 'error');
      return;
    }
    const payload = buildPayload();
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#525252] dark:text-neutral-600 mb-2 flex items-center gap-2"><Rocket className="w-3 h-3" /> / Admin · Hackathons</div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">黑客松管理</h2>
        </div>
        <button type="button" onClick={() => isCreating ? resetForm() : setIsCreating(true)} className={actionButtonClass}>
          {isCreating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{isCreating ? '关闭编辑器' : '新增黑客松'}
        </button>
      </div>

      {isCreating && (
        <section className="border-2 border-[#171717] dark:border-neutral-400 bg-white dark:bg-neutral-100 mb-8">
          <div className="px-4 md:px-6 pt-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-neutral-600 mb-4">{editingId ? `/ Edit · ${form.title}` : '/ New Hackathon'}</div>
            <Tabs
              value={workspace}
              onChange={(key) => setWorkspace(key as Workspace)}
              ariaLabel="黑客松工作区"
              idPrefix="admin-hackathon"
              items={WORKSPACES.map((item) => ({ ...item, disabled: !editingId && ['registrations', 'submissions', 'people'].includes(item.key) }))}
              className="flex gap-1 overflow-x-auto border-b border-[#DAD8D0]"
              itemClassName={(_, active) => `shrink-0 px-3 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border-b-2 disabled:opacity-30 ${active ? 'border-[#171717] text-[#171717] dark:text-[#F5F4F0]' : 'border-transparent text-[#525252] dark:text-[#A8A6A0]'}`}
            />
          </div>
          <div className="p-4 md:p-6">
            <TabPanel value={workspace} tabKey="basic" idPrefix="admin-hackathon">
              <form onSubmit={(event: FormEvent) => { event.preventDefault(); handleSave(); }} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="标题" value={form.title} onChange={(title) => setForm({ ...form, title })} required />
                  <Field label="地点" value={form.location} onChange={(location) => setForm({ ...form, location })} />
                  <Select label="流程状态" value={form.status} onChange={(status) => setForm({ ...form, status: status as HackathonStatus })} options={STATUS_OPTIONS.map((status) => ({ value: status, label: STATUS_LABELS[status] }))} />
                  <div>
                    <Field label="Banner URL" value={form.bannerUrl} onChange={(bannerUrl) => setForm({ ...form, bannerUrl })} />
                    <FileUploadButton className="mt-2" scope="hackathon-banner" refId={editingId ?? undefined} label="上传 Banner" accept="image/*" existingUrl={form.bannerUrl} onUploaded={(bannerUrl) => setForm((current) => ({ ...current, bannerUrl }))} onClear={() => setForm((current) => ({ ...current, bannerUrl: '' }))} />
                  </div>
                  <Field label="开始时间" type="datetime-local" value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate })} required />
                  <Field label="结束时间" type="datetime-local" value={form.endDate} onChange={(endDate) => setForm({ ...form, endDate })} required />
                  <Field label="报名截止" type="datetime-local" value={form.registerDeadline} onChange={(registerDeadline) => setForm({ ...form, registerDeadline })} />
                  <Field label="作品提交截止" type="datetime-local" value={form.submissionDeadline} onChange={(submissionDeadline) => setForm({ ...form, submissionDeadline })} />
                  <div className="grid grid-cols-2 gap-2"><Field label="最小团队人数" type="number" min={1} value={String(form.minTeamSize)} onChange={(value) => setForm({ ...form, minTeamSize: Number(value) })} /><Field label="最大团队人数" type="number" min={1} value={String(form.maxTeamSize)} onChange={(value) => setForm({ ...form, maxTeamSize: Number(value) })} /></div>
                </div>
                <Field label="活动介绍" value={form.description} onChange={(description) => setForm({ ...form, description })} multiline required />
                <Field label="比赛规则" value={form.rules} onChange={(rules) => setForm({ ...form, rules })} multiline />
                <Field label="提交要求（逐行填写）" value={form.submissionRequirements} onChange={(submissionRequirements) => setForm({ ...form, submissionRequirements })} multiline placeholder="作品 Demo 链接\n代码仓库链接\n3 分钟以内演示视频" />
                <Field label="奖项设置" value={form.prizes} onChange={(prizes) => setForm({ ...form, prizes })} multiline />
                <div className="flex gap-2 pt-2"><button type="submit" disabled={saving} className={actionButtonClass}><Save className="w-4 h-4" />{editingId ? '保存基础信息' : '创建黑客松'}</button><button type="button" onClick={resetForm} className={outlineButtonClass}>取消</button></div>
              </form>
            </TabPanel>
            <TabPanel value={workspace} tabKey="registration" idPrefix="admin-hackathon">
              <RegistrationFormBuilder mode={form.registrationMode} fields={form.registrationFields} registrationUrl={form.registrationUrl} registrationLabel={form.registrationLabel} saving={saving} onModeChange={(registrationMode) => setForm({ ...form, registrationMode })} onFieldsChange={(registrationFields) => setForm({ ...form, registrationFields })} onUrlChange={(registrationUrl) => setForm({ ...form, registrationUrl })} onLabelChange={(registrationLabel) => setForm({ ...form, registrationLabel })} onSave={handleSave} />
            </TabPanel>
            <TabPanel value={workspace} tabKey="registrations" idPrefix="admin-hackathon">{editingId && <RegistrationsPanel hackathonId={editingId} />}</TabPanel>
            <TabPanel value={workspace} tabKey="submissions" idPrefix="admin-hackathon">{editingId && <SubmissionsPanel hackathonId={editingId} />}</TabPanel>
            <TabPanel value={workspace} tabKey="people" idPrefix="admin-hackathon">{editingId ? <JudgesSponsorsPanel hackathonId={editingId} /> : <p>请先保存基础信息</p>}</TabPanel>
          </div>
        </section>
      )}

      <Panel title={`全部黑客松 (${hackathons?.length ?? 0})`}>
        {isLoading ? <div className="p-12 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">加载中...</div> : hackathons?.length ? (
          <div role="table" aria-label="黑客松列表" className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
            <div role="row" className="min-w-[760px] grid grid-cols-12 gap-4 py-3 border-b-2 border-[#171717] text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]"><div role="columnheader" className="col-span-1">#</div><div role="columnheader" className="col-span-4">标题</div><div role="columnheader" className="col-span-2">状态</div><div role="columnheader" className="col-span-2">时间</div><div role="columnheader" className="col-span-2">团队</div><div role="columnheader" className="col-span-1 text-right">操作</div></div>
            {hackathons.map((hackathon, index) => (
              <div key={hackathon.id} role="row" className="min-w-[760px] grid grid-cols-12 gap-4 py-4 items-center text-sm border-b border-[#EEEDE9] hover:bg-[#F5F4F0] dark:hover:bg-[#0D0C0A]">
                <div role="cell" className="col-span-1 text-[10px] font-black text-[#525252] dark:text-[#A8A6A0]">{String(index + 1).padStart(2, '0')}</div>
                <div role="cell" title={hackathon.title} className="col-span-4 font-black tracking-tight truncate">{hackathon.title}</div>
                <div role="cell" className="col-span-2"><HackathonStatusBadge status={hackathon.status} /></div>
                <div role="cell" className="col-span-2 text-[10px] font-black text-[#525252] dark:text-[#A8A6A0]">{new Date(hackathon.startDate).toLocaleDateString('zh-CN')} - {new Date(hackathon.endDate).toLocaleDateString('zh-CN')}</div>
                <div role="cell" className="col-span-2 text-[10px] font-black text-[#525252] dark:text-[#A8A6A0]">{hackathon.minTeamSize}-{hackathon.maxTeamSize} 人</div>
                <div role="cell" className="col-span-1 flex justify-end gap-1"><button type="button" onClick={() => startEdit(hackathon)} className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center hover:bg-[#171717] hover:text-white" title="管理" aria-label={`管理 ${hackathon.title}`}><Edit2 className="w-3.5 h-3.5" /></button>{hackathon.status !== 'cancelled' && <button type="button" onClick={() => setPendingCancel(hackathon)} className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center hover:bg-red-50 text-red-600" title="取消活动" aria-label={`取消活动 ${hackathon.title}`}><Archive className="w-3.5 h-3.5" /></button>}</div>
              </div>
            ))}
          </div>
        ) : <div className="p-16 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">暂无黑客松</div>}
      </Panel>

      <ConfirmDialog
        open={!!pendingCancel}
        onClose={() => setPendingCancel(null)}
        onConfirm={async () => { if (pendingCancel) await cancelMutation.mutateAsync(pendingCancel.id); }}
        title="确认取消该黑客松?"
        description={pendingCancel ? `「${pendingCancel.title}」将标记为已取消，不再开放参与；报名和作品记录会保留供查询。` : ''}
        variant="warning"
        confirmText="确认取消"
      />
    </div>
  );
}
