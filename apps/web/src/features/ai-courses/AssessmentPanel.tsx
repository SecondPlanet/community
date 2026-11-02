import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, CheckCircle2, LoaderCircle, RotateCcw } from 'lucide-react';
import { aiCoursesApi } from './aiCoursesApi';
import { aiCourseKeys } from './queryKeys';
import type {
  AssessmentAnswerInput,
  AssessmentAttemptView,
  AssessmentQuestionView,
} from './aiCourses.types';
import { Button } from '../../components/ui/Button';
import { trackAiCourseEvent } from './trackAiCourseEvent';
import { mapAiCourseError } from './aiCourseErrors';

type Confidence = AssessmentAnswerInput['confidence'];

interface AssessmentDraft {
  answers: Record<string, string>;
  confidence: Record<string, Confidence>;
  currentQuestionIndex: number;
  clientSubmissionKey: string;
}

interface PersistedAssessmentAttempt {
  assessmentId: string;
  attemptId: string;
}

function optionValue(option: NonNullable<AssessmentQuestionView['options']>[number], index: number) {
  if (typeof option === 'string') return { id: option, label: option };
  return {
    id: option.id ?? option.value ?? `option-${index + 1}`,
    label: option.text ?? option.label ?? option.value ?? option.id ?? `选项 ${index + 1}`,
  };
}

function activeAssessmentKey(projectId: string, lessonId: string) {
  return `ai-course-assessment-active:${projectId}:${lessonId}`;
}

function assessmentDraftKey(projectId: string, assessmentId: string, schemaVersion: number) {
  return `ai-course-assessment:${projectId}:${assessmentId}:${schemaVersion}`;
}

function assessmentAttemptKey(projectId: string, lessonId: string) {
  return `ai-course-assessment-attempt:${projectId}:${lessonId}`;
}

function storageGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Draft persistence is best effort; storage can be unavailable in private mode.
  }
}

function storageRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // No-op when storage is unavailable.
  }
}

function readDraft(key: string): AssessmentDraft | null {
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AssessmentDraft>;
    if (!value.answers || typeof value.answers !== 'object' ||
      !value.confidence || typeof value.confidence !== 'object' ||
      !Number.isInteger(value.currentQuestionIndex) ||
      typeof value.clientSubmissionKey !== 'string') return null;
    return {
      answers: value.answers as Record<string, string>,
      confidence: value.confidence as Record<string, Confidence>,
      currentQuestionIndex: Math.max(0, value.currentQuestionIndex ?? 0),
      clientSubmissionKey: value.clientSubmissionKey,
    };
  } catch {
    storageRemove(key);
    return null;
  }
}

function readPersistedAttempt(key: string): PersistedAssessmentAttempt | null {
  const raw = storageGet(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedAssessmentAttempt>;
    if (typeof value.assessmentId !== 'string' || typeof value.attemptId !== 'string') return null;
    return { assessmentId: value.assessmentId, attemptId: value.attemptId };
  } catch {
    storageRemove(key);
    return null;
  }
}

function clearOtherDraftVersions(projectId: string, assessmentId: string, keepKey: string) {
  const prefix = `ai-course-assessment:${projectId}:${assessmentId}:`;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix) && key !== keepKey) window.sessionStorage.removeItem(key);
    }
  } catch {
    // No-op when storage enumeration is unavailable.
  }
}

export function AssessmentPanel({ projectId, lessonId }: { projectId: string; lessonId: string }) {
  const queryClient = useQueryClient();
  const [persistedAttempt] = useState(() =>
    readPersistedAttempt(assessmentAttemptKey(projectId, lessonId)),
  );
  const [assessmentId, setAssessmentId] = useState<string | null>(() =>
    persistedAttempt?.assessmentId ?? storageGet(activeAssessmentKey(projectId, lessonId)),
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, Confidence>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(persistedAttempt?.attemptId ?? null);
  const [hydratedDraftKey, setHydratedDraftKey] = useState<string | null>(null);
  const submissionKeyRef = useRef<string | null>(null);
  const questionHeadingRef = useRef<HTMLLegendElement>(null);
  const focusQuestionRef = useRef(false);
  const completedEventRef = useRef<string | null>(null);
  const createKeyRef = useRef(crypto.randomUUID());
  const lastAnswersRef = useRef<{
    answers: Record<string, string>;
    confidence: Record<string, Confidence>;
    questionIds: string[];
  } | null>(null);

  const create = useMutation({
    mutationFn: () => aiCoursesApi.createAssessment(projectId, lessonId, createKeyRef.current),
    onSuccess: (result) => {
      trackAiCourseEvent({ lessonId, eventType: 'personal_assessment_started', metadata: { projectId, assessmentId: result.assessmentId } });
      setAnswers({});
      setConfidence({});
      setCurrentQuestionIndex(0);
      setAttemptId(null);
      setHydratedDraftKey(null);
      submissionKeyRef.current = null;
      storageRemove(assessmentAttemptKey(projectId, lessonId));
      storageSet(activeAssessmentKey(projectId, lessonId), result.assessmentId);
      setAssessmentId(result.assessmentId);
    },
  });
  const assessment = useQuery({
    queryKey: aiCourseKeys.assessment(projectId, assessmentId ?? ''),
    queryFn: () => aiCoursesApi.getAssessment(projectId, assessmentId!),
    enabled: Boolean(assessmentId),
    refetchInterval: (query) => query.state.data?.status === 'generating'
      ? (document.visibilityState === 'visible' ? 2000 : 10000)
      : false,
  });
  const questions = useMemo(() => assessment.data?.questions ?? [], [assessment.data?.questions]);
  const schemaVersion = assessment.data?.schemaVersion;
  const assessmentStatus = assessment.data?.status;

  useEffect(() => {
    if (assessmentStatus === 'ready') createKeyRef.current = crypto.randomUUID();
  }, [assessmentStatus]);

  useEffect(() => {
    if (!assessmentId || assessmentStatus !== 'ready' || schemaVersion === undefined) return;
    const key = assessmentDraftKey(projectId, assessmentId, schemaVersion);
    clearOtherDraftVersions(projectId, assessmentId, key);
    const saved = readDraft(key);
    setAnswers(saved?.answers ?? {});
    setConfidence(saved?.confidence ?? {});
    setCurrentQuestionIndex(Math.min(saved?.currentQuestionIndex ?? 0, Math.max(questions.length - 1, 0)));
    submissionKeyRef.current = saved?.clientSubmissionKey || crypto.randomUUID();
    setHydratedDraftKey(key);
  }, [assessmentId, assessmentStatus, projectId, questions.length, schemaVersion]);

  useEffect(() => {
    if (!hydratedDraftKey || !submissionKeyRef.current) return;
    storageSet(hydratedDraftKey, JSON.stringify({
      answers,
      confidence,
      currentQuestionIndex,
      clientSubmissionKey: submissionKeyRef.current,
    } satisfies AssessmentDraft));
  }, [answers, confidence, currentQuestionIndex, hydratedDraftKey]);

  useEffect(() => {
    if (!focusQuestionRef.current) return;
    focusQuestionRef.current = false;
    questionHeadingRef.current?.focus();
  }, [currentQuestionIndex]);

  const submit = useMutation({
    mutationFn: (override?: { clientSubmissionKey: string; answers: Record<string, string>; confidence: Record<string, Confidence>; questionIds: string[] }) => {
      // 重做（"重新作答" 按钮）必须使用全新的 clientSubmissionKey 才会创建新行；
      // 正常提交则沿用现有 ref（可能在草稿里持久化），保证幂等键稳定。
      submissionKeyRef.current = override?.clientSubmissionKey
        ?? submissionKeyRef.current
        ?? crypto.randomUUID();
      const sourceAnswers = override?.answers ?? answers;
      const sourceConfidence = override?.confidence ?? confidence;
      const sourceQuestionIds = override?.questionIds ?? questions.map((question) => question.id);
      const payload = sourceQuestionIds.map<AssessmentAnswerInput>((questionId) => ({
        questionId,
        answer: sourceAnswers[questionId] ?? '',
        confidence: sourceConfidence[questionId] ?? 'medium',
      }));
      // Remember what we just submitted so "重新作答" can replay the same set
      // of answers (and confidences) under a fresh clientSubmissionKey without
      // depending on the original draft still being in sessionStorage.
      lastAnswersRef.current = {
        answers: { ...sourceAnswers },
        confidence: { ...sourceConfidence },
        questionIds: [...sourceQuestionIds],
      };
      return aiCoursesApi.submitAssessmentAttempt(projectId, assessmentId!, {
        clientSubmissionKey: submissionKeyRef.current,
        answers: payload,
      });
    },
    onSuccess: (result) => {
      storageSet(activeAssessmentKey(projectId, lessonId), assessmentId!);
      storageSet(assessmentAttemptKey(projectId, lessonId), JSON.stringify({
        assessmentId: assessmentId!,
        attemptId: result.attemptId,
      } satisfies PersistedAssessmentAttempt));
      if (result.status === 'completed' && hydratedDraftKey) storageRemove(hydratedDraftKey);
      queryClient.setQueryData<AssessmentAttemptView>(
        aiCourseKeys.attempt(projectId, assessmentId!, result.attemptId),
        result,
      );
      setAttemptId(result.attemptId);
    },
  });
  const redoAssessment = () => {
    const last = lastAnswersRef.current;
    if (!last) return;
    submit.mutate({
      clientSubmissionKey: crypto.randomUUID(),
      answers: last.answers,
      confidence: last.confidence,
      questionIds: last.questionIds,
    });
  };
  const attempt = useQuery({
    queryKey: aiCourseKeys.attempt(projectId, assessmentId ?? '', attemptId ?? ''),
    queryFn: () => aiCoursesApi.getAssessmentAttempt(projectId, assessmentId!, attemptId!),
    enabled: Boolean(assessmentId && attemptId),
    refetchInterval: (query) => query.state.data?.status === 'pending' || query.state.data?.status === 'grading'
      ? (document.visibilityState === 'visible' ? 2000 : 10000)
      : false,
  });

  useEffect(() => {
    if (attempt.data?.status !== 'completed' || completedEventRef.current === attempt.data.attemptId) return;
    completedEventRef.current = attempt.data.attemptId;
    if (hydratedDraftKey) storageRemove(hydratedDraftKey);
    trackAiCourseEvent({ lessonId, eventType: 'personal_assessment_completed', metadata: { projectId, assessmentId, attemptId: attempt.data.attemptId, score: attempt.data.score } });
  }, [assessmentId, attempt.data, hydratedDraftKey, lessonId, projectId]);

  const resetAssessment = () => {
    if (assessmentId && schemaVersion !== undefined) {
      storageRemove(assessmentDraftKey(projectId, assessmentId, schemaVersion));
    }
    storageRemove(activeAssessmentKey(projectId, lessonId));
    storageRemove(assessmentAttemptKey(projectId, lessonId));
    // A failed generation is terminal for its idempotency key. Starting a
    // visibly new assessment must not replay that failed job forever.
    createKeyRef.current = crypto.randomUUID();
    setAssessmentId(null);
    setHydratedDraftKey(null);
    create.reset();
  };

  if (!assessmentId) {
    return (
      <section className="mx-auto mt-10 max-w-[760px] rounded-3xl bg-[#E9F4DD] p-6 dark:bg-[#20351C] dark:text-white md:p-8">
        <BrainCircuit className="h-7 w-7" aria-hidden="true" />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">测试一下你真正理解了多少</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-700 dark:text-white/80">AI 会围绕本节的关键概念出题，并根据答案判断下一步应该复习、强化还是继续。</p>
        <Button className="mt-6" isLoading={create.isPending} onClick={() => create.mutate()}>生成理解测试</Button>
        {create.isError && <p role="alert" className="mt-3 text-sm text-red-700">{mapAiCourseError(create.error).message}</p>}
      </section>
    );
  }

  if (assessment.isPending || assessment.data?.status === 'generating') {
    return <section role="status" className="mx-auto mt-10 max-w-[760px] rounded-3xl border border-neutral-200 bg-white p-8"><LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" /><p className="mt-3 font-medium">AI 正在根据本节内容设计理解测试…</p><p className="mt-2 text-sm leading-6 text-neutral-600">通常需要 10–40 秒。你可以继续阅读讲义，完成后这里会自动更新。</p></section>;
  }
  if (assessment.isError || assessment.data?.status === 'failed') {
    return <section role="alert" className="mx-auto mt-10 max-w-[760px] rounded-3xl border border-red-200 bg-white p-8"><p className="font-medium">测试生成失败，没有影响你的课程内容。</p><Button variant="secondary" className="mt-4" onClick={resetAssessment} leftIcon={<RotateCcw className="h-4 w-4" />}>重新生成</Button></section>;
  }
  if (attempt.data?.status === 'completed') {
    const result = attempt.data;
    const stage = result.score == null ? '测试已完成' : result.score < 60 ? '需要巩固' : result.score < 80 ? '正在掌握' : '掌握良好';
    const feedback = result.grading?.feedback ?? result.grading?.items?.map((item) => ({
      questionId: item.questionId,
      verdict: item.verdict,
      explanation: item.explanation ?? '这道题的正确答案需要老师讲解 — 可通过下方的"询问 AI 助教"按钮继续追问。',
    })) ?? [];
    const questionById = new Map(questions.map((question) => [question.id, question.prompt]));
    const verdictLabel = { correct: '理解正确', partial: '部分掌握', incorrect: '需要复习' } as const;
    const nextHref = result.recommendation?.continueHref ?? '#personal-lesson-panel';
    const nextLabel = result.recommendation?.nextStep === 'continue'
      ? '继续下一步学习'
      : result.recommendation?.nextStep === 'reinforce' ? '开始针对性强化' : '回到讲义复习';
    return (
      <section className="mx-auto mt-10 max-w-[760px] space-y-6 rounded-3xl bg-neutral-950 p-6 text-white md:p-8" aria-labelledby="assessment-result-title">
        <header><CheckCircle2 className="h-8 w-8 text-[#B7E58A]" aria-hidden="true" /><h2 id="assessment-result-title" className="mt-5 text-sm font-normal text-neutral-300">本次理解测试</h2><p className="mt-1 text-4xl font-semibold tracking-tight">{stage}</p><p className="mt-3 text-sm leading-6 text-neutral-300">AI 已把本次作答证据计入概念掌握度；结果用于安排下一步，不锁定课程。</p></header>
        {feedback.length > 0 && <div><h3 className="text-lg font-semibold">逐题反馈</h3><ol className="mt-3 space-y-3">{feedback.map((item, index) => <li key={`${item.questionId}-${index}`} className="rounded-2xl bg-white/10 p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{questionById.get(item.questionId) ?? `第 ${index + 1} 题`}</p><span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs">{verdictLabel[item.verdict]}</span></div><p className="mt-2 text-sm leading-6 text-neutral-300">{item.explanation}</p></li>)}</ol></div>}
        {result.grading?.misconceptions && result.grading.misconceptions.length > 0 && <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4"><h3 className="font-semibold">值得留意的误区</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-neutral-200">{result.grading.misconceptions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {result.grading?.mastery && result.grading.mastery.length > 0 && <div><h3 className="text-lg font-semibold">概念掌握</h3><ul className="mt-3 grid gap-2 sm:grid-cols-2">{result.grading.mastery.map((item) => <li key={item.conceptKey} className="rounded-xl bg-white/10 p-3"><p className="text-sm font-medium">{item.conceptKey}</p><p className="mt-1 text-xs text-neutral-300">{item.score < 0.6 ? '需要巩固' : item.score < 0.8 ? '正在掌握' : '掌握良好'} · {item.evidence}</p></li>)}</ul></div>}
        <div className="border-t border-white/15 pt-5"><p className="text-sm leading-6 text-neutral-300">{result.recommendation?.message ?? '根据本次理解证据继续安排学习。'}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="secondary" fullWidth className="sm:w-auto" onClick={redoAssessment} disabled={submit.isPending}>重新作答</Button>
            <a href={nextHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-white px-4 text-sm font-semibold text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:w-auto">{nextLabel}</a>
          </div>
        </div>
      </section>
    );
  }
  if (attempt.data?.status === 'failed') {
    return <section role="alert" className="mx-auto mt-10 max-w-[760px] rounded-3xl border border-red-200 bg-white p-8"><p className="font-medium">评分暂时失败，你的答案已经保留在当前页面。</p><Button variant="secondary" className="mt-4" onClick={() => { storageRemove(assessmentAttemptKey(projectId, lessonId)); setAttemptId(null); }}>返回答案</Button></section>;
  }
  if (attemptId) {
    return <section role="status" className="mx-auto mt-10 max-w-[760px] rounded-3xl border border-neutral-200 bg-white p-8"><LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" /><p className="mt-3 font-medium">AI 正在逐题判断你的理解…</p><p className="mt-2 text-sm leading-6 text-neutral-600">通常需要 10–40 秒，请不要重复提交；完成后结果会自动出现。</p></section>;
  }
  if (questions.length === 0) {
    return <section role="alert" className="mx-auto mt-10 max-w-[760px] rounded-3xl border border-red-200 bg-white p-8"><p className="font-medium">测试内容暂时不可用，请重新生成。</p><Button variant="secondary" className="mt-4" onClick={resetAssessment}>重新生成</Button></section>;
  }

  const currentQuestion = questions[currentQuestionIndex];
  const complete = questions.every((question) => (answers[question.id] ?? '').trim());
  const moveTo = (nextIndex: number) => {
    focusQuestionRef.current = true;
    setCurrentQuestionIndex(nextIndex);
  };

  return (
    <section className="mx-auto mt-10 max-w-[760px] rounded-3xl border border-neutral-200 bg-white p-5 md:p-8" aria-labelledby="assessment-title">
      <h2 id="assessment-title" className="text-2xl font-semibold tracking-tight">本节理解测试</h2>
      <p className="mt-2 text-sm text-neutral-600">第 {currentQuestionIndex + 1} / {questions.length} 题 · 按自己的理解回答即可。</p>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true"><div className="h-full rounded-full bg-neutral-950" style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }} /></div>
      <fieldset className="mt-7 border-0 p-0">
        <legend ref={questionHeadingRef} tabIndex={-1} className="font-medium leading-6 outline-none">{currentQuestion.prompt}</legend>
        {currentQuestion.type === 'single_choice' ? (
          <div className="mt-4 space-y-2">{currentQuestion.options?.map((raw, optionIndex) => {
            const option = optionValue(raw, optionIndex);
            return <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 hover:bg-neutral-50"><input type="radio" name={currentQuestion.id} value={option.id} checked={answers[currentQuestion.id] === option.id} onChange={(event) => setAnswers((current) => ({ ...current, [currentQuestion.id]: event.target.value }))} /><span className="text-sm">{option.label}</span></label>;
          })}</div>
        ) : (
          <textarea aria-label={`回答：${currentQuestion.prompt}`} value={answers[currentQuestion.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [currentQuestion.id]: event.target.value }))} rows={5} maxLength={10000} className="mt-4 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-950" placeholder={currentQuestion.type === 'teach_back' ? '像向一位朋友解释那样回答…' : '写下你的理解…'} />
        )}
      </fieldset>
      <fieldset className="mt-6 border-0 p-0">
        <legend className="text-sm font-medium text-neutral-700 dark:text-neutral-800">你对这道题的把握</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([['low', '不太确定'], ['medium', '比较确定'], ['high', '很有把握']] as const).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-neutral-200 px-2 text-center text-xs has-[:checked]:border-neutral-950 has-[:checked]:bg-neutral-950 has-[:checked]:text-white">
              <input className="sr-only" type="radio" name={`${currentQuestion.id}-confidence`} value={value} checked={(confidence[currentQuestion.id] ?? 'medium') === value} onChange={() => setConfidence((current) => ({ ...current, [currentQuestion.id]: value }))} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="secondary" fullWidth className="sm:w-auto" disabled={currentQuestionIndex === 0} onClick={() => moveTo(currentQuestionIndex - 1)}>上一题</Button>
        {currentQuestionIndex < questions.length - 1 ? (
          <Button fullWidth className="sm:w-auto" disabled={!(answers[currentQuestion.id] ?? '').trim()} onClick={() => moveTo(currentQuestionIndex + 1)}>下一题</Button>
        ) : (
          <Button fullWidth className="sm:w-auto" disabled={!complete} isLoading={submit.isPending} onClick={() => submit.mutate(undefined)}>提交并查看理解反馈</Button>
        )}
      </div>
      {submit.isError && <p role="alert" className="mt-3 text-sm text-red-700">答案提交失败，请检查网络后重试。</p>}
    </section>
  );
}
