import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useApiMutation } from '../../../hooks/useApiMutation';
import { FileUploadButton } from '../../../components/admin/FileUploadButton';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Field, Panel, actionButtonClass, inputClass } from './ui';

interface Judge {
  id: string;
  name: string;
  title?: string | null;
  avatarUrl?: string | null;
  orderIndex: number;
  role: string;
}

interface Sponsor {
  id: string;
  name: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  tier: string;
  orderIndex: number;
}

const SPONSOR_TIERS = ['platinum', 'gold', 'silver', 'bronze'] as const;
const JUDGE_ROLES = ['judge', 'advisor', 'host'] as const;

export function JudgesSponsorsPanel({ hackathonId }: { hackathonId: string }) {
  return <div className="grid xl:grid-cols-2 gap-6"><JudgesPanel hackathonId={hackathonId} /><SponsorsPanel hackathonId={hackathonId} /></div>;
}

function JudgesPanel({ hackathonId }: { hackathonId: string }) {
  const emptyJudge = { name: '', title: '', avatarUrl: '', role: 'judge' as (typeof JUDGE_ROLES)[number] };
  const [newJudge, setNewJudge] = useState(emptyJudge);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const { data: judges } = useQuery({
    queryKey: ['admin-hackathon-judges', hackathonId],
    queryFn: async () => (await api.get<Judge[]>(`/api/v1/hackathons/${hackathonId}/judges`)).data ?? [],
  });
  const addMutation = useApiMutation({
    mutationFn: (payload: typeof newJudge & { orderIndex: number }) => api.post(`/api/v1/hackathons/${hackathonId}/judges`, payload),
    successMessage: '评委已添加',
    invalidateKeys: [['admin-hackathon-judges', hackathonId]],
    onSuccess: () => setNewJudge(emptyJudge),
  });
  const removeMutation = useApiMutation({
    mutationFn: (judgeId: string) => api.delete(`/api/v1/hackathons/${hackathonId}/judges/${judgeId}`),
    successMessage: '评委已删除',
    invalidateKeys: [['admin-hackathon-judges', hackathonId]],
  });

  return (
    <Panel title={`评委 (${judges?.length ?? 0})`}>
      <ul className="mb-4 space-y-1">{(judges ?? []).map((judge) => <li key={judge.id} className="flex items-center gap-2 px-2 py-2 text-xs border border-[#EEEDE9] dark:border-[#2C2A26]"><span className="font-black">#{judge.orderIndex + 1}</span><span className="flex-1 truncate">{judge.name}</span><span className="text-[10px] uppercase opacity-70">{judge.role}</span><button type="button" aria-label={`删除评委 ${judge.name}`} onClick={() => setPendingDelete({ id: judge.id, name: judge.name })} className="text-red-600 hover:bg-red-50 px-2 min-w-[32px] min-h-[32px]">×</button></li>)}</ul>
      <div className="space-y-2">
        <Field label="姓名" required value={newJudge.name} onChange={(name) => setNewJudge({ ...newJudge, name })} placeholder="如 张三" />
        <Field label="头衔" value={newJudge.title} onChange={(title) => setNewJudge({ ...newJudge, title })} placeholder="如 AI 科学家" />
        <FileUploadButton scope="hackathon-judge-avatar" label="上传头像" accept="image/*" existingUrl={newJudge.avatarUrl} onUploaded={(avatarUrl) => setNewJudge((current) => ({ ...current, avatarUrl }))} onClear={() => setNewJudge((current) => ({ ...current, avatarUrl: '' }))} />
        <div className="flex gap-2"><select aria-label="评委角色" value={newJudge.role} onChange={(event) => setNewJudge({ ...newJudge, role: event.target.value as (typeof JUDGE_ROLES)[number] })} className={inputClass}>{JUDGE_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select><button type="button" onClick={() => addMutation.mutate({
          ...newJudge,
          orderIndex: judges?.length ?? 0,
          // 可选 URL 不传空串(服务端把空串视为非法 URL)
          avatarUrl: newJudge.avatarUrl || undefined,
          title: newJudge.title || undefined,
        })} disabled={addMutation.isPending || !newJudge.name.trim()} className={actionButtonClass}>+ 添加</button></div>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) await removeMutation.mutateAsync(target.id);
        }}
        title="确认删除该评委？"
        description={pendingDelete ? `「${pendingDelete.name}」将从该活动的评委名单中移除。` : ''}
        confirmText="确认删除"
      />
    </Panel>
  );
}

function SponsorsPanel({ hackathonId }: { hackathonId: string }) {
  const emptySponsor = { name: '', websiteUrl: '', logoUrl: '', tier: 'silver' as (typeof SPONSOR_TIERS)[number] };
  const [newSponsor, setNewSponsor] = useState(emptySponsor);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const { data: sponsors } = useQuery({
    queryKey: ['admin-hackathon-sponsors', hackathonId],
    queryFn: async () => (await api.get<Sponsor[]>(`/api/v1/hackathons/${hackathonId}/sponsors`)).data ?? [],
  });
  const addMutation = useApiMutation({
    mutationFn: (payload: typeof newSponsor & { orderIndex: number }) => api.post(`/api/v1/hackathons/${hackathonId}/sponsors`, payload),
    successMessage: '赞助商已添加',
    invalidateKeys: [['admin-hackathon-sponsors', hackathonId]],
    onSuccess: () => setNewSponsor(emptySponsor),
  });
  const removeMutation = useApiMutation({
    mutationFn: (sponsorId: string) => api.delete(`/api/v1/hackathons/${hackathonId}/sponsors/${sponsorId}`),
    successMessage: '赞助商已删除',
    invalidateKeys: [['admin-hackathon-sponsors', hackathonId]],
  });

  return (
    <Panel title={`赞助商 (${sponsors?.length ?? 0})`}>
      <ul className="mb-4 space-y-1">{(sponsors ?? []).map((sponsor) => <li key={sponsor.id} className="flex items-center gap-2 px-2 py-2 text-xs border border-[#EEEDE9] dark:border-[#2C2A26]"><span className="font-black">#{sponsor.orderIndex + 1}</span><span className="flex-1 truncate">{sponsor.name}</span><span className="text-[10px] uppercase opacity-70">{sponsor.tier}</span>{sponsor.websiteUrl && <a href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600">↗</a>}<button type="button" aria-label={`删除赞助商 ${sponsor.name}`} onClick={() => setPendingDelete({ id: sponsor.id, name: sponsor.name })} className="text-red-600 hover:bg-red-50 px-2 min-w-[32px] min-h-[32px]">×</button></li>)}</ul>
      <div className="space-y-2">
        <Field label="赞助商名称" required value={newSponsor.name} onChange={(name) => setNewSponsor({ ...newSponsor, name })} placeholder="如 某某科技" />
        <Field label="官网 URL" value={newSponsor.websiteUrl} onChange={(websiteUrl) => setNewSponsor({ ...newSponsor, websiteUrl })} placeholder="https://…（可选）" />
        <FileUploadButton scope="hackathon-sponsor-logo" label="上传 Logo" accept="image/*" existingUrl={newSponsor.logoUrl} onUploaded={(logoUrl) => setNewSponsor((current) => ({ ...current, logoUrl }))} onClear={() => setNewSponsor((current) => ({ ...current, logoUrl: '' }))} />
        <div className="flex gap-2"><select aria-label="赞助商等级" value={newSponsor.tier} onChange={(event) => setNewSponsor({ ...newSponsor, tier: event.target.value as (typeof SPONSOR_TIERS)[number] })} className={inputClass}>{SPONSOR_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select><button type="button" onClick={() => addMutation.mutate({
          ...newSponsor,
          orderIndex: sponsors?.length ?? 0,
          // 可选 URL 不传空串(服务端把空串视为非法 URL)
          websiteUrl: newSponsor.websiteUrl || undefined,
          logoUrl: newSponsor.logoUrl || undefined,
        })} disabled={addMutation.isPending || !newSponsor.name.trim()} className={actionButtonClass}>+ 添加</button></div>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) await removeMutation.mutateAsync(target.id);
        }}
        title="确认删除该赞助商？"
        description={pendingDelete ? `「${pendingDelete.name}」将从该活动的赞助商名单中移除。` : ''}
        confirmText="确认删除"
      />
    </Panel>
  );
}
