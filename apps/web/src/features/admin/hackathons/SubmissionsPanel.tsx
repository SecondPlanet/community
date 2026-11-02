import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, Eye } from 'lucide-react';
import type { SubmissionStatus } from '@secondplanet/shared-types';
import { adminHackathonsApi, type AdminSubmission } from './types';
import { Drawer } from '../../../components/ui/Drawer';
import { useApiMutation } from '../../../hooks/useApiMutation';
import { useToast } from '../../../components/auth/Toast';
import { Field, Panel, Select, actionButtonClass, inputClass, outlineButtonClass } from './ui';

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  under_review: '评审中',
  shortlisted: '入围',
  winner: '获奖',
  rejected: '未入选',
};

export function SubmissionsPanel({ hackathonId }: { hackathonId: string }) {
  const [selected, setSelected] = useState<AdminSubmission | null>(null);
  const { data: submissions, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-hackathon-submissions', hackathonId],
    queryFn: async () => (await adminHackathonsApi.getAllSubmissions(hackathonId)) as AdminSubmission[],
  });

  return (
    <Panel title={`作品评审 (${submissions?.length ?? 0})`}>
      {isLoading ? <div className="py-12 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">加载作品中...</div> : isError ? (
        <div className="py-12 text-center"><p className="text-sm text-red-600 mb-3">作品加载失败</p><button type="button" className={outlineButtonClass} onClick={() => refetch()}>重试</button></div>
      ) : submissions?.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[680px] grid grid-cols-12 gap-3 px-3 pb-3 border-b border-[#171717] text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">
            <div className="col-span-4">作品</div><div className="col-span-3">团队 / 成员</div><div className="col-span-2">状态</div><div className="col-span-2">评分</div><div className="col-span-1 text-right">评审</div>
          </div>
          {submissions.map((submission) => (
            <div key={submission.id} className="min-w-[680px] grid grid-cols-12 gap-3 px-3 py-4 border-b border-[#EEEDE9] dark:border-[#2C2A26] items-center text-sm">
              <div className="col-span-4 font-black truncate">{submission.title}</div>
              <div className="col-span-3 text-xs truncate">{submission.team?.name || submission.user?.name || submission.userId || '个人作品'}</div>
              <div className="col-span-2 text-xs font-bold">{STATUS_LABELS[submission.status]}</div>
              <div className="col-span-2 text-sm font-black">{submission.score ?? '—'}{submission.score != null && <span className="text-[10px] font-black text-[#525252] dark:text-[#A8A6A0]"> /100</span>}</div>
              <div className="col-span-1 text-right"><button type="button" title="查看并评审" aria-label={`评审 ${submission.title}`} onClick={() => setSelected(submission)} className="p-2 hover:bg-[#171717] hover:text-white"><Eye className="w-4 h-4" /></button></div>
            </div>
          ))}
        </div>
      ) : <div className="py-12 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">暂无提交作品</div>}

      {selected && <SubmissionDrawer key={selected.id} hackathonId={hackathonId} submission={selected} onClose={() => setSelected(null)} onUpdated={setSelected} />}
    </Panel>
  );
}

function SubmissionDrawer({ hackathonId, submission, onClose, onUpdated }: {
  hackathonId: string;
  submission: AdminSubmission;
  onClose: () => void;
  onUpdated: (submission: AdminSubmission) => void;
}) {
  const [score, setScore] = useState(submission.score?.toString() ?? '');
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const [status, setStatus] = useState<SubmissionStatus>(submission.status === 'draft' ? 'submitted' : submission.status);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [scoreError, setScoreError] = useState('');
  const dirty = score !== (submission.score?.toString() ?? '') || feedback !== (submission.feedback ?? '');
  const { showToast } = useToast();
  const judgeMutation = useApiMutation({
    mutationFn: () => adminHackathonsApi.judgeSubmission(hackathonId, submission.id, {
      score: Number(score),
      feedback: feedback.trim(),
      status,
    }),
    successMessage: '作品评审已保存',
    invalidateKeys: [['admin-hackathon-submissions', hackathonId]],
    onSuccess: onUpdated,
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(score);
    if (score === '' || !Number.isInteger(value) || value < 0 || value > 100) {
      setScoreError('评分必须是 0-100 的整数');
      return;
    }
    setScoreError('');
    judgeMutation.mutate();
  };

  const requestClose = () => {
    if (dirty && !window.confirm('评分尚未保存，关闭将丢失修改。确定关闭？')) return;
    onClose();
  };

  const download = async (index: number) => {
    setDownloading(index);
    try {
      const { downloadUrl } = await adminHackathonsApi.getSubmissionAttachmentUrl(hackathonId, submission.id, index);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      showToast('附件下载链接获取失败', 'error');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Drawer open onClose={requestClose} title="作品详情与评审" width={620}>
      <div className="p-5 space-y-6">
        <div><div className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] mb-2">{submission.team?.name || submission.user?.name || '参赛作品'}</div><h4 className="text-2xl font-black tracking-tight">{submission.title}</h4></div>
        <p className="text-sm whitespace-pre-wrap">{submission.description}</p>
        <div className="flex flex-wrap gap-2">
          {submission.demoUrl && <a href={submission.demoUrl} target="_blank" rel="noopener noreferrer" title={submission.demoUrl} className={outlineButtonClass}>Demo <ExternalLink className="w-3.5 h-3.5" /></a>}
          {submission.repoUrl && <a href={submission.repoUrl} target="_blank" rel="noopener noreferrer" className={outlineButtonClass}>代码仓库 <ExternalLink className="w-3.5 h-3.5" /></a>}
          {submission.videoUrl && <a href={submission.videoUrl} target="_blank" rel="noopener noreferrer" className={outlineButtonClass}>演示视频 <ExternalLink className="w-3.5 h-3.5" /></a>}
        </div>
        {!!submission.attachments?.length && <section><h5 className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] mb-3">/ 附件</h5><div className="space-y-2">{submission.attachments.map((attachment, index) => <button key={attachment.key} type="button" disabled={downloading === index} onClick={() => download(index)} className={`${outlineButtonClass} w-full justify-between`}><span className="truncate">{attachment.name || attachment.key}</span><Download className="w-4 h-4" /></button>)}</div></section>}
        <form className="border-t border-[#DAD8D0] pt-5 space-y-4" onSubmit={submit}>
          <Field label="评分（0-100 整数）" type="number" min={0} max={100} step={1} value={score} onChange={(value) => { setScore(value); setScoreError(''); }} required error={scoreError} />
          <Select label="评审状态" value={status} onChange={(value) => setStatus(value as SubmissionStatus)} options={(['under_review', 'shortlisted', 'winner', 'rejected'] as const).map((value) => ({ value, label: STATUS_LABELS[value] }))} />
          <label className="block text-xs font-black">评语<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={5} placeholder="给参赛团队的评审反馈" className={`${inputClass} mt-2 font-normal`} /></label>
          <button type="submit" disabled={judgeMutation.isPending || score === ''} className={actionButtonClass}>{judgeMutation.isPending ? '保存中...' : '保存评审结果'}</button>
        </form>
      </div>
    </Drawer>
  );
}
