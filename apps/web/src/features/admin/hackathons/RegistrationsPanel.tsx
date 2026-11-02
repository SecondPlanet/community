import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Eye, Search } from 'lucide-react';
import { adminHackathonsApi, pageItems, type AdminRegistration, type RegistrationAttachment, type RegistrationField } from './types';
import { Drawer } from '../../../components/ui/Drawer';
import { useApiMutation } from '../../../hooks/useApiMutation';
import { useToast } from '../../../components/auth/Toast';
import { Panel, actionButtonClass, dangerButtonClass, inputClass, outlineButtonClass } from './ui';

const REVIEW_OPTIONS = [
  { value: 'approved', label: '已通过', action: '通过报名' },
  { value: 'waitlisted', label: '候补', action: '设为候补' },
  { value: 'rejected', label: '已拒绝', action: '拒绝报名' },
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  waitlisted: '候补',
  rejected: '已拒绝',
};

export function RegistrationsPanel({ hackathonId }: { hackathonId: string }) {
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminRegistration | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-hackathon-registrations', hackathonId, status, search],
    queryFn: async () => pageItems(await adminHackathonsApi.getRegistrations(hackathonId, {
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
    })),
  });

  return (
    <Panel title={`报名审核 (${data?.length ?? 0})`}>
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <select aria-label="审核状态筛选" value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} lg:max-w-48`}>
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          {REVIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <form className="flex flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); }}>
          <input aria-label="搜索报名人" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="搜索姓名、邮箱或报名昵称" className={inputClass} />
          <button type="submit" className={outlineButtonClass}><Search className="w-4 h-4" /> 搜索</button>
        </form>
      </div>

      {isLoading ? <div className="py-12 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">加载报名中...</div> : isError ? (
        <div className="py-12 text-center"><p className="text-sm text-red-600 mb-3">报名加载失败</p><button type="button" className={outlineButtonClass} onClick={() => refetch()}>重试</button></div>
      ) : data?.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[680px] grid grid-cols-12 gap-3 px-3 pb-3 border-b border-[#171717] text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">
            <div className="col-span-4">报名人</div><div className="col-span-3">提交时间</div><div className="col-span-2">审核状态</div><div className="col-span-2">审核备注</div><div className="col-span-1 text-right">详情</div>
          </div>
          {data.map((registration) => (
            <div key={registration.id} className="min-w-[680px] grid grid-cols-12 gap-3 px-3 py-4 border-b border-[#EEEDE9] dark:border-[#2C2A26] items-center text-sm">
              <div className="col-span-4 min-w-0"><div className="font-black truncate">{registration.user?.name || '未命名用户'}</div><div className="text-xs text-[#525252] dark:text-[#A8A6A0] truncate">{registration.user?.email || registration.userId}</div></div>
              <div className="col-span-3 text-xs">{new Date(registration.registeredAt).toLocaleString('zh-CN')}</div>
              <div className="col-span-2"><ReviewBadge status={registration.reviewStatus} /></div>
              <div className="col-span-2 text-xs text-[#525252] dark:text-[#A8A6A0] truncate">{registration.reviewNote || '—'}</div>
              <div className="col-span-1 text-right"><button type="button" title="查看报名详情" aria-label="查看报名详情" onClick={() => setSelected(registration)} className="p-2 hover:bg-[#171717] hover:text-white"><Eye className="w-4 h-4" /></button></div>
            </div>
          ))}
        </div>
      ) : <div className="py-12 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">
          {status || search ? '没有符合筛选条件的报名' : '暂无报名 — 在「报名表」里配置题目后, 参赛者即可在站内提交报名'}
        </div>}

      {selected && <RegistrationDrawer key={selected.id} hackathonId={hackathonId} registration={selected} onClose={() => setSelected(null)} onUpdated={setSelected} />}
    </Panel>
  );
}

function ReviewBadge({ status }: { status?: string | null }) {
  const value = status || 'pending';
  return <span className={`inline-flex px-2 py-1 text-[10px] font-black uppercase tracking-widest ${value === 'approved' ? 'bg-green-100 text-green-800' : value === 'rejected' ? 'bg-red-100 text-red-700' : value === 'waitlisted' ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-700'}`}>{STATUS_LABELS[value] ?? value}</span>;
}

function RegistrationDrawer({ hackathonId, registration, onClose, onUpdated }: {
  hackathonId: string;
  registration: AdminRegistration;
  onClose: () => void;
  onUpdated: (registration: AdminRegistration) => void;
}) {
  const [note, setNote] = useState(registration.reviewNote ?? '');
  const [downloading, setDownloading] = useState<string | null>(null);
  const { showToast } = useToast();
  const reviewMutation = useApiMutation({
    mutationFn: (payload: { reviewStatus: string; force?: boolean }) => adminHackathonsApi.reviewRegistration(hackathonId, registration.id, {
      ...payload,
      reviewNote: note.trim(),
    }),
    successMessage: '报名审核已更新',
    invalidateKeys: [['admin-hackathon-registrations', hackathonId]],
    onSuccess: onUpdated,
  });

  const download = async (fieldId: string) => {
    setDownloading(fieldId);
    try {
      const { downloadUrl } = await adminHackathonsApi.getRegistrationAttachmentUrl(hackathonId, registration.id, fieldId);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      showToast('附件下载链接获取失败', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const fields = snapshotFields(registration.formSnapshot);
  const answers = answerEntries(registration.answers);
  // 已通过/已拒绝为终态: 当前态按钮禁用, 改态需二次确认(后端另有 force 状态机保护)
  const terminal = registration.reviewStatus === 'approved' || registration.reviewStatus === 'rejected';
  const review = (reviewStatus: string) => {
    if (terminal && reviewStatus !== registration.reviewStatus) {
      if (!window.confirm(`该报名当前为「${STATUS_LABELS[registration.reviewStatus as keyof typeof STATUS_LABELS] ?? registration.reviewStatus}」, 确认要变更审核结论？`)) return;
      reviewMutation.mutate({ reviewStatus, force: true });
      return;
    }
    reviewMutation.mutate({ reviewStatus });
  };

  return (
    <Drawer open onClose={onClose} title="报名详情" width={620}>
      <div className="p-5 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div><h4 className="text-xl font-black">{registration.user?.name || '未命名用户'}</h4><p className="text-sm text-[#525252] dark:text-[#A8A6A0]">{registration.user?.email || registration.userId}</p></div>
          <ReviewBadge status={registration.reviewStatus} />
        </div>
        <section>
          <h5 className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] mb-3">/ 提交时表单快照</h5>
          {answers.length ? <dl className="space-y-3">{answers.map(([id, value]) => {
            const field = fields.find((item) => item.id === id);
            return <div key={id} className="border-b border-[#EEEDE9] dark:border-[#2C2A26] pb-3"><dt className="text-xs font-black mb-1">{field?.label || id}{field?.required && <span className="text-red-600"> *</span>}</dt><dd className="text-sm whitespace-pre-wrap break-words">{field?.type === 'file' && isUploadedFile(value) ? <button type="button" disabled={downloading === id} onClick={() => download(id)} className={outlineButtonClass}><Download className="w-4 h-4" />{value.name}</button> : formatAnswer(value)}</dd></div>;
          })}</dl> : <p className="text-sm text-[#525252] dark:text-[#A8A6A0]">无自定义答案</p>}
        </section>
        <section className="border-t border-[#DAD8D0] pt-5">
          <label className="block text-xs font-black mb-2">审核备注<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="仅用于审核记录" className={`${inputClass} mt-2 font-normal`} /></label>
          <div className="grid sm:grid-cols-3 gap-2 mt-3">{REVIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={reviewMutation.isPending || option.value === registration.reviewStatus}
              onClick={() => review(option.value)}
              className={option.value === 'rejected' ? dangerButtonClass : option.value === 'approved' ? actionButtonClass : outlineButtonClass}
            >
              {option.value === registration.reviewStatus ? `当前：${STATUS_LABELS[option.value]}` : option.action}
            </button>
          ))}</div>
        </section>
      </div>
    </Drawer>
  );
}

function snapshotFields(snapshot: AdminRegistration['formSnapshot']): RegistrationField[] {
  return Array.isArray(snapshot) ? snapshot : snapshot?.fields ?? [];
}

function answerEntries(answers: AdminRegistration['answers']): Array<[string, unknown]> {
  if (Array.isArray(answers)) return answers.map((answer) => [answer.fieldId, answer.value]);
  return Object.entries(answers ?? {});
}

function isUploadedFile(value: unknown): value is RegistrationAttachment {
  return !!value && typeof value === 'object' && 'key' in value && 'name' in value;
}

function formatAnswer(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.map(formatAnswer).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
