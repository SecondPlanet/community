import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, UserCheck } from 'lucide-react';
import type { HackathonWithDetails, UploadedFileMeta } from '@secondplanet/shared-types';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../../components/auth/Toast';
import { Button } from '../../components/ui/Button';
import { extractErrorMessage } from '../../lib/apiError';
import { TeamSection } from './TeamSection';
import { SubmissionSection } from './SubmissionSection';
import { isActiveRegistration, isApproved, participantApi, REVIEW_LABELS, type ParticipantRegistration } from './participantApi';

export function ParticipantHub({ hackathon, onRegister }: { hackathon: HackathonWithDetails; onRegister: () => void }) {
  const user = useAuthStore((state) => state.user);
  const { showToast } = useToast();
  const internal = hackathon.registrationMode === 'internal';
  const { data: registration, isLoading } = useQuery({
    queryKey: ['hackathon-registration', hackathon.id],
    queryFn: () => participantApi.getMyRegistration(hackathon.id),
    enabled: !!user && internal && !!hackathon.id,
  });
  const active = isActiveRegistration(registration) ? registration : null;

  const download = async (fieldId: string) => {
    if (!active) return;
    try {
      const { downloadUrl } = await participantApi.getRegistrationAttachmentUrl(hackathon.id, active.id, fieldId);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
    } catch (error) {
      showToast(extractErrorMessage(error), 'error');
    }
  };

  if (!user) {
    return (
      <EmptyParticipant title="登录后管理参赛事项" description="报名审核、组队和作品提交都会集中在这里。">
        <Link to={`/auth/login?from=${encodeURIComponent(`/hackathons/${hackathon.id}`)}`} className="inline-flex items-center gap-2 bg-[#171717] px-5 py-3 text-xs font-black text-white">登录并返回 <ArrowRight className="w-4 h-4" /></Link>
      </EmptyParticipant>
    );
  }

  if (!internal) {
    return <EmptyParticipant title="本活动使用外部报名" description="请通过活动页面提供的外部链接完成登记；站内无需组队或提交作品。" />;
  }

  if (isLoading) return <p className="py-16 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">加载参赛信息…</p>;

  if (!active) {
    const closed = !!hackathon.registerDeadline && new Date(hackathon.registerDeadline).getTime() < Date.now();
    return (
      <EmptyParticipant title={closed ? '报名已截止' : '先完成报名，再开始构建'} description="提交报名后，可在这里查看审核结果。审核通过即可组队和提交作品。">
        {!closed && <Button onClick={onRegister}>填写报名信息 <ArrowRight className="w-4 h-4" /></Button>}
      </EmptyParticipant>
    );
  }

  return (
    <div className="space-y-6">
      <RegistrationSummary registration={active} onDownload={download} />
      {isApproved(active) && (
        <>
          <TeamSection hackathonId={hackathon.id} maxTeamSize={hackathon.maxTeamSize} />
          <SubmissionSection hackathonId={hackathon.id} deadline={hackathon.submissionDeadline || hackathon.endDate} />
        </>
      )}
    </div>
  );
}

function RegistrationSummary({ registration, onDownload }: { registration: ParticipantRegistration; onDownload: (fieldId: string) => void }) {
  const review = registration.reviewStatus;
  const fields = registration.formSnapshot ?? [];
  return (
    <section className="border-2 border-[#171717] bg-white dark:bg-[#1A1916]" aria-labelledby="registration-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#171717] dark:border-[#3a3a38] p-5">
        <div className="flex items-center gap-3">
          <UserCheck className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">/ Registration</div>
            <h2 id="registration-summary-title" className="font-black">我的报名</h2>
          </div>
        </div>
        <span className="bg-[#171717] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white">{review ? REVIEW_LABELS[review] : '报名成功'}</span>
      </div>
      <div className="p-5">
        {registration.reviewNote && <p className="mb-4 border-l-2 border-[#171717] bg-[#F0EEE8] dark:bg-[#1A1916] p-3 text-sm">审核备注：{registration.reviewNote}</p>}
        {!!fields.length && (
          <dl className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const answer = registration.answers?.[field.id];
              if (answer == null || answer === '' || (Array.isArray(answer) && !answer.length)) return null;
              const file = !Array.isArray(answer) && typeof answer !== 'string' ? answer as UploadedFileMeta : null;
              return (
                <div key={field.id}>
                  <dt className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">{field.label}</dt>
                  <dd className="mt-1 text-sm whitespace-pre-line">
                    {file ? (
                      <button type="button" onClick={() => onDownload(field.id)} className="inline-flex items-center gap-2 font-bold underline underline-offset-2"><Download className="w-3.5 h-3.5" />{file.name}</button>
                    ) : Array.isArray(answer) ? answer.join('、') : typeof answer === 'string' ? answer : ''}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </section>
  );
}

function EmptyParticipant({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="border-2 border-dashed border-[#A9A79F] bg-white dark:bg-[#1A1916] px-6 py-16 text-center">
      <h2 className="text-2xl font-black tracking-tight">{title}</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#525252] dark:text-[#A8A6A0]">{description}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
