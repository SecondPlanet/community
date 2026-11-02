import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Edit3, FileCheck2, Plus, Send } from 'lucide-react';
import type { UploadedFileMeta } from '@secondplanet/shared-types';
import { useApiMutation } from '../../hooks/useApiMutation';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../../components/auth/Toast';
import { Drawer } from '../../components/ui/Drawer';
import { Button } from '../../components/ui/Button';
import { extractErrorMessage } from '../../lib/apiError';
import { AttachmentUpload } from './AttachmentUpload';
import { participantApi, type ParticipantSubmission, type SubmissionPayload } from './participantApi';

export function SubmissionSection({ hackathonId, deadline }: { hackathonId: string; deadline: string | Date }) {
  const user = useAuthStore((state) => state.user);
  const [editor, setEditor] = useState<ParticipantSubmission | 'new' | null>(null);
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['hackathon-submissions', hackathonId],
    queryFn: () => participantApi.getMySubmissions(hackathonId),
  });
  const { data: teams = [] } = useQuery({
    queryKey: ['hackathon-teams', hackathonId],
    queryFn: () => participantApi.getTeams(hackathonId),
  });
  const myTeam = teams.find((team) => team.captainId === user?.id || team.members?.some((member) => member.userId === user?.id));
  const invalidateKeys = [['hackathon-submissions', hackathonId], ['hackathon', hackathonId]];
  const saveMutation = useApiMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: SubmissionPayload }) => id
      ? participantApi.updateSubmission(hackathonId, id, payload)
      : participantApi.createSubmission(hackathonId, payload),
    successMessage: '作品草稿已保存',
    invalidateKeys,
    onSuccess: () => setEditor(null),
  });
  const submitMutation = useApiMutation({
    mutationFn: (id: string) => participantApi.updateSubmission(hackathonId, id, { status: 'submitted' }),
    successMessage: '作品已提交',
    invalidateKeys,
  });
  const { showToast } = useToast();
  const canEdit = new Date(deadline).getTime() >= Date.now();

  const download = async (submissionId: string, index: number) => {
    try {
      const { downloadUrl } = await participantApi.getSubmissionAttachmentUrl(hackathonId, submissionId, index);
      openDownload(downloadUrl);
    } catch (error) {
      showToast(extractErrorMessage(error), 'error');
    }
  };

  return (
    <section className="border-2 border-[#171717] bg-white dark:bg-[#1A1916]" aria-labelledby="submission-section-title">
      <div className="flex items-center justify-between gap-4 border-b-2 border-[#171717] dark:border-[#3a3a38] p-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#525252] dark:text-[#A8A6A0]">/ Submission</div>
          <h2 id="submission-section-title" className="mt-1 text-xl font-black tracking-tight">我的作品</h2>
        </div>
        {canEdit && <Button size="sm" onClick={() => setEditor('new')}><Plus className="w-4 h-4" /> 新建草稿</Button>}
      </div>
      <div className="p-5">
        <p className="mb-4 text-xs text-[#525252] dark:text-[#A8A6A0]">{canEdit ? '截止前可保存草稿、编辑并提交；附件仅你和组织者可下载。' : '提交已截止，作品现为只读状态。'}</p>
        {isLoading ? <p className="text-sm text-[#525252] dark:text-[#A8A6A0]">加载作品中…</p> : submissions.length === 0 ? (
          <div className="border border-dashed border-[#A9A79F] p-8 text-center">
            <FileCheck2 className="mx-auto mb-3 w-6 h-6 text-[#525252] dark:text-[#A8A6A0]" />
            <p className="text-sm text-[#525252] dark:text-[#A8A6A0]">还没有作品草稿。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <article key={submission.id} className="border border-[#171717] dark:border-[#3a3a38] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={`inline-block px-2 py-1 text-[10px] font-black uppercase tracking-widest ${submission.status === 'draft' ? 'bg-[#EEEDE9] text-[#525252] dark:text-[#A8A6A0]' : 'bg-[#171717] text-white'}`}>
                      {submission.status === 'draft' ? '草稿' : '已提交'}
                    </span>
                    <h3 className="mt-3 text-xl font-black tracking-tight">{submission.title}</h3>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditor(submission)}><Edit3 className="w-3.5 h-3.5" /> 编辑</Button>
                      {submission.status === 'draft' && <Button size="sm" isLoading={submitMutation.isPending && submitMutation.variables === submission.id} onClick={() => submitMutation.mutate(submission.id)}><Send className="w-3.5 h-3.5" /> 提交作品</Button>}
                    </div>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[#444444]">{submission.description}</p>
                <SubmissionLinks submission={submission} />
                {!!submission.attachments?.length && (
                  <ul className="mt-4 border border-[#D8D6CF] divide-y divide-[#D8D6CF]">
                    {submission.attachments?.map((file, index) => (
                      <li key={file.key} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <span className="truncate">{file.name}</span>
                        <button type="button" onClick={() => download(submission.id, index)} className="shrink-0 font-bold underline underline-offset-2">下载附件</button>
                      </li>
                    ))}
                  </ul>
                )}
                {submission.feedback && <p className="mt-4 border-l-2 border-[#171717] pl-3 text-xs text-[#525252] dark:text-[#A8A6A0]">评审反馈：{submission.feedback}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
      <Drawer open={!!editor} onClose={() => setEditor(null)} title={editor === 'new' ? '新建作品草稿' : '编辑作品'} width={640}>
        {editor && (
          <SubmissionEditor
            key={editor === 'new' ? 'new' : editor.id}
            hackathonId={hackathonId}
            submission={editor === 'new' ? null : editor}
            teamId={editor === 'new' ? myTeam?.id : editor.teamId || undefined}
            saving={saveMutation.isPending}
            onSave={(id, payload) => saveMutation.mutate({ id, payload })}
            onDownload={download}
          />
        )}
      </Drawer>
    </section>
  );
}

function SubmissionEditor({ hackathonId, submission, teamId, saving, onSave, onDownload }: {
  hackathonId: string;
  submission: ParticipantSubmission | null;
  teamId?: string;
  saving: boolean;
  onSave: (id: string | undefined, payload: SubmissionPayload) => void;
  onDownload: (submissionId: string, index: number) => void;
}) {
  const [title, setTitle] = useState(submission?.title ?? '');
  const [description, setDescription] = useState(submission?.description ?? '');
  const [demoUrl, setDemoUrl] = useState(submission?.demoUrl ?? '');
  const [repoUrl, setRepoUrl] = useState(submission?.repoUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(submission?.videoUrl ?? '');
  const [attachments, setAttachments] = useState<UploadedFileMeta[]>(submission?.attachments ?? []);

  const [fieldErrors, setFieldErrors] = useState<{ title?: string; description?: string }>({});

  const save = (event: FormEvent) => {
    event.preventDefault();
    // 中文行内错误, 不依赖浏览器原生校验气泡(英文, 且不播报给读屏)
    const errors: { title?: string; description?: string } = {};
    if (!title.trim()) errors.title = '请填写作品标题';
    if (!description.trim()) errors.description = '请填写作品介绍';
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    onSave(submission?.id, {
      title: title.trim(),
      description: description.trim(),
      demoUrl: demoUrl.trim() || undefined,
      repoUrl: repoUrl.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      ...(submission?.id ? {} : { teamId }),
      attachments,
    });
  };

  return (
    <form onSubmit={save} noValidate className="space-y-5 p-5">
      <EditorInput label="作品标题" required value={title} onChange={(value) => { setTitle(value); setFieldErrors((e) => ({ ...e, title: undefined })); }} maxLength={120} error={fieldErrors.title} />
      <label className="block text-xs font-black uppercase tracking-wider">作品介绍 *
        <textarea required aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description ? 'submission-desc-error' : undefined} maxLength={5000} value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((e) => ({ ...e, description: undefined })); }} className="mt-2 min-h-36 w-full resize-y border border-[#A9A79F] bg-white dark:bg-[#1A1916] px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:ring-2 focus:ring-[#171717] aria-[invalid=true]:border-red-700" />
        {fieldErrors.description && <span id="submission-desc-error" role="alert" className="mt-1 block text-xs font-normal normal-case tracking-normal text-red-700">{fieldErrors.description}</span>}
      </label>
      <EditorInput label="演示地址" type="url" value={demoUrl} onChange={setDemoUrl} placeholder="https://…" />
      <EditorInput label="代码仓库" type="url" value={repoUrl} onChange={setRepoUrl} placeholder="https://…" />
      <EditorInput label="视频地址" type="url" value={videoUrl} onChange={setVideoUrl} placeholder="https://…" />
      <AttachmentUpload
        hackathonId={hackathonId}
        scope="submission-attachment"
        label="私有附件"
        files={attachments}
        multiple
        onUploaded={(file) => setAttachments((current) => [...current.filter((item) => item.key !== file.key), file])}
        onRemove={(key) => setAttachments((current) => current.filter((file) => file.key !== key))}
        onDownload={submission ? (_, index) => onDownload(submission.id, index) : undefined}
      />
      <Button type="submit" size="lg" fullWidth isLoading={saving}>{submission?.status === 'submitted' ? '保存修改' : '保存草稿'}</Button>
      {submission?.status !== 'submitted' && <p className="text-center text-xs text-[#525252] dark:text-[#A8A6A0]">保存后，在作品卡片点击“提交作品”完成正式提交。</p>}
    </form>
  );
}

function EditorInput({ label, value, onChange, error, ...props }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; maxLength?: number; placeholder?: string; error?: string }) {
  const errorId = `${label}-error`;
  return (
    <label className="block text-xs font-black uppercase tracking-wider">{label}{props.required && ' *'}
      <input {...props} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} className="mt-2 w-full border border-[#A9A79F] bg-white dark:bg-[#1A1916] px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:ring-2 focus:ring-[#171717] aria-[invalid=true]:border-red-700" />
      {error && <span id={errorId} role="alert" className="mt-1 block text-xs font-normal normal-case tracking-normal text-red-700">{error}</span>}
    </label>
  );
}

function SubmissionLinks({ submission }: { submission: ParticipantSubmission }) {
  const links = [
    ['演示', submission.demoUrl],
    ['代码', submission.repoUrl],
    ['视频', submission.videoUrl],
  ].filter((item): item is [string, string] => !!item[1]);
  if (!links.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 border border-[#171717] px-3 py-1.5 text-xs font-bold hover:bg-[#EEEDE9] dark:hover:bg-[#2C2A26]">{label}<ArrowUpRight className="w-3 h-3" /></a>)}
    </div>
  );
}

function openDownload(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.click();
}
