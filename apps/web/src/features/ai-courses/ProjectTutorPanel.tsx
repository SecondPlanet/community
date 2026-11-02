import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, LoaderCircle, Send, Sparkles } from 'lucide-react';
import { aiCoursesApi } from './aiCoursesApi';
import { aiCourseKeys } from './queryKeys';
import { Button } from '../../components/ui/Button';
import { trackAiCourseEvent } from './trackAiCourseEvent';
import { useAiJob } from './hooks/useAiJob';
import { mapAiCourseError } from './aiCourseErrors';

type TutorScope = 'lesson' | 'project';
type VariantAction = 'simplify' | 'new_example' | 'deepen';

export function ProjectTutorPanel({ projectId, lessonId }: { projectId: string; lessonId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState<TutorScope>('lesson');
  const [variantJobId, setVariantJobId] = useState<string | null>(null);
  const [variantAction, setVariantAction] = useState<VariantAction | null>(null);
  const variantKeys = useRef(new Map<VariantAction, string>());
  const bindingKey = aiCourseKeys.tutorSession(projectId, scope, scope === 'lesson' ? lessonId : undefined);
  const binding = useQuery({
    queryKey: bindingKey,
    queryFn: async () => {
      const existing = await aiCoursesApi.listTutorSessions(projectId);
      const match = existing.items.find((item) => scope === 'lesson' ? item.lessonId === lessonId : item.lessonId === null);
      return match ?? aiCoursesApi.createTutorSession(projectId, scope === 'lesson' ? lessonId : undefined);
    },
    staleTime: 30_000,
  });
  const sessionId = binding.data?.id;
  const session = useQuery({
    queryKey: [...bindingKey, 'messages'],
    queryFn: () => aiCoursesApi.getTutorSession(projectId, sessionId!),
    enabled: Boolean(sessionId),
  });
  const send = useMutation({
    mutationFn: (content: string) => aiCoursesApi.sendTutorMessage(projectId, sessionId!, content, scope === 'lesson' ? lessonId : undefined),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: [...bindingKey, 'messages'], exact: true });
      void queryClient.invalidateQueries({ queryKey: aiCourseKeys.tutorSessions(projectId) });
    },
  });
  const variant = useMutation({
    mutationFn: (action: VariantAction) => {
      let key = variantKeys.current.get(action);
      if (!key) { key = crypto.randomUUID(); variantKeys.current.set(action, key); }
      return aiCoursesApi.createLessonVariant(projectId, lessonId, action, undefined, key);
    },
    onSuccess: (result, action) => {
      setVariantJobId(result.jobId);
      setVariantAction(action);
    },
  });
  const variantJob = useAiJob(projectId, variantJobId);
  const retryVariant = useMutation({
    mutationFn: (jobId: string) => aiCoursesApi.retryJob(projectId, jobId),
    onSuccess: (job) => setVariantJobId(job.id),
  });
  useEffect(() => {
    if (variantJob.data?.status === 'succeeded' && variantAction) variantKeys.current.delete(variantAction);
  }, [variantAction, variantJob.data?.status]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (content && sessionId && !send.isPending) {
      trackAiCourseEvent({ lessonId, eventType: 'personal_tutor_action_clicked', metadata: { projectId, action: 'message', scope } });
      send.mutate(content);
    }
  };
  const askForHelp = () => {
    if (!sessionId || send.isPending) return;
    trackAiCourseEvent({ lessonId, eventType: 'personal_tutor_action_clicked', metadata: { projectId, action: 'not_understood', scope } });
    send.mutate('我还没有理解本节的核心概念。请先用一个诊断问题判断我卡在哪里，再用更简单的方式解释。');
  };
  const variantResult = variantJob.data?.status === 'succeeded' ? variantJob.data.resultRef.variantContent : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-neutral-100 dark:text-neutral-900 [&_.border-neutral-200]:dark:border-neutral-400 [&_.text-neutral-950]:dark:text-neutral-900 [&_.text-neutral-600]:dark:text-neutral-800 [&_.text-neutral-500]:dark:text-neutral-800" aria-label="课程导师">
      <div className="border-b border-neutral-200 p-4">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCEBFF]"><Bot className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="font-semibold">课程导师</h2><p className="text-xs text-neutral-500">围绕本节或整门课程继续对话</p></div></div>
        <div className="mt-4 flex rounded-xl bg-neutral-100 p-1 dark:bg-neutral-200" aria-label="导师对话范围">
          {([{ id: 'lesson', label: '本节' }, { id: 'project', label: '整课' }] as const).map((item) => <button key={item.id} type="button" aria-pressed={scope === item.id} onClick={() => setScope(item.id)} className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-medium ${scope === item.id ? 'bg-white text-neutral-950 shadow-sm dark:bg-neutral-400 dark:text-white' : 'text-neutral-600 dark:text-neutral-800'}`}>{item.label}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" onClick={askForHelp} disabled={!sessionId || send.isPending} className="min-h-11 rounded-lg border border-neutral-200 px-2 text-xs font-medium disabled:opacity-50">没看懂</button>
          <button type="button" onClick={() => { trackAiCourseEvent({ lessonId, eventType: 'personal_tutor_action_clicked', metadata: { projectId, action: 'simplify' } }); variant.mutate('simplify'); }} disabled={variant.isPending || variantJob.isFetching || variantJob.data?.status === 'failed'} className="min-h-11 rounded-lg border border-neutral-200 px-2 text-xs font-medium disabled:opacity-50">简单一点</button>
          <button type="button" onClick={() => { trackAiCourseEvent({ lessonId, eventType: 'personal_tutor_action_clicked', metadata: { projectId, action: 'new_example' } }); variant.mutate('new_example'); }} disabled={variant.isPending || variantJob.isFetching || variantJob.data?.status === 'failed'} className="min-h-11 rounded-lg border border-neutral-200 px-2 text-xs font-medium disabled:opacity-50">换个例子</button>
          <button type="button" onClick={() => { trackAiCourseEvent({ lessonId, eventType: 'personal_tutor_action_clicked', metadata: { projectId, action: 'deepen' } }); variant.mutate('deepen'); }} disabled={variant.isPending || variantJob.isFetching || variantJob.data?.status === 'failed'} className="min-h-11 rounded-lg border border-neutral-200 px-2 text-xs font-medium disabled:opacity-50">深入一点</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
        {binding.isPending || (Boolean(sessionId) && session.isPending) ? <div role="status" className="flex items-center gap-2 text-sm text-neutral-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />正在准备导师…</div> : null}
        {sessionId && (session.data?.messages ?? []).length === 0 && !session.isPending ? <div className="rounded-2xl bg-[#F1F0EB] p-4 text-sm leading-6 text-neutral-700 dark:bg-neutral-200 dark:text-neutral-800">你可以让我换一种方式解释、判断你的理解，或追问不清楚的地方。</div> : null}
        {session.data?.messages?.filter((message) => message.role !== 'system').map((message) => <div key={message.id} className={message.role === 'user' ? 'ml-8 rounded-2xl bg-neutral-950 px-4 py-3 text-sm leading-6 text-white' : 'mr-4 whitespace-pre-wrap rounded-2xl bg-[#F1F0EB] px-4 py-3 text-sm leading-6 text-neutral-900'}>{message.content}</div>)}
        {(variant.isPending || variantJob.data?.status === 'queued' || variantJob.data?.status === 'running') && <div role="status" className="rounded-2xl border border-[#BCD5F5] bg-[#EEF6FF] p-4 text-sm text-neutral-900 dark:border-[#36506D] dark:bg-[#172538] dark:text-white"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />正在生成新的讲解，不会覆盖原讲义…</div>}
        {variantResult && <div className="rounded-2xl border border-[#BCD5F5] bg-[#EEF6FF] p-4 text-sm leading-6 text-neutral-900 dark:border-[#36506D] dark:bg-[#172538] dark:text-white"><p className="mb-2 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" aria-hidden="true" />{variantResult.title}</p><p className="whitespace-pre-wrap">{variantResult.markdown}</p><p className="mt-3 border-t border-[#BCD5F5] pt-3 font-medium dark:border-[#36506D]">要点：{variantResult.keyTakeaway}</p></div>}
        {variantJob.data?.status === 'failed' && <div role="alert" className="rounded-xl border border-red-200 p-3 text-sm text-red-700"><p>{variantJob.data.errorMessage}</p>{variantJob.data.retryable && <Button variant="secondary" className="mt-3" isLoading={retryVariant.isPending} onClick={() => retryVariant.mutate(variantJob.data.id)}>重试补充讲解</Button>}</div>}
        {send.isPending && <div role="status" className="flex items-center gap-2 text-sm text-neutral-500"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />课程导师正在结合你的学习状态思考…</div>}
        {(send.isError || session.isError || binding.isError || variant.isError) && <p role="alert" className="text-sm text-red-700">{mapAiCourseError(send.error ?? session.error ?? binding.error ?? variant.error).message}</p>}
      </div>
      <form onSubmit={submit} className="border-t border-neutral-200 p-4"><label htmlFor={`project-tutor-input-${scope}`} className="sr-only">向课程导师提问</label><textarea id={`project-tutor-input-${scope}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={2000} className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-950 dark:bg-neutral-200 dark:text-neutral-900" placeholder="哪里还不够清楚？" /><Button type="submit" fullWidth className="mt-3" disabled={!draft.trim() || !sessionId} isLoading={send.isPending} rightIcon={<Send className="h-4 w-4" />}>发送给导师</Button><p className="mt-2 text-center text-[10px] text-neutral-500">AI 回答可能有误，请结合讲义判断</p></form>
    </div>
  );
}
