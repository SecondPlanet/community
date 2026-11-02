import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import type { HackathonFormField, HackathonWithDetails } from '@secondplanet/shared-types';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { useApiMutation } from '../../hooks/useApiMutation';
import { useAuthStore } from '../../stores/authStore';
import { Drawer } from '../../components/ui/Drawer';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AttachmentUpload } from './AttachmentUpload';
import {
  isActiveRegistration,
  isApproved,
  participantApi,
  REVIEW_LABELS,
  type ParticipantRegistration,
  type RegistrationAnswer,
  type RegistrationAnswers,
} from './participantApi';

interface RegistrationFlowProps {
  hackathon: HackathonWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenParticipation: () => void;
}

export function RegistrationFlow({ hackathon, open, onOpenChange, onOpenParticipation }: RegistrationFlowProps) {
  const user = useAuthStore((state) => state.user);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { data: registration, isLoading } = useQuery({
    queryKey: ['hackathon-registration', hackathon.id],
    queryFn: () => participantApi.getMyRegistration(hackathon.id),
    enabled: !!user && !!hackathon.id,
  });
  const cancelMutation = useApiMutation({
    mutationFn: () => hackathonsApi.cancelRegistration(hackathon.id),
    successMessage: '已取消报名',
    invalidateKeys: [
      ['hackathon-registration', hackathon.id],
      ['hackathon', hackathon.id],
    ],
  });

  const activeRegistration = isActiveRegistration(registration) ? registration : null;
  const closed = !!hackathon.registerDeadline && new Date(hackathon.registerDeadline).getTime() < Date.now();
  // 已取消/已结束/评审中的活动不再开放任何报名入口(避免外部 CTA 把用户带去失效页面)
  const openForRegistration = hackathon.status !== 'cancelled' && hackathon.status !== 'finished' && hackathon.status !== 'judging';
  const loginHref = `/auth/login?from=${encodeURIComponent(`/hackathons/${hackathon.id}`)}`;

  return (
    <>
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <div className="border border-white/20 px-4 py-3 text-xs text-white/60">正在读取报名状态…</div>
        ) : activeRegistration ? (
          <RegistrationStatus registration={activeRegistration} onOpenParticipation={onOpenParticipation} />
        ) : user ? (
          <button
            type="button"
            disabled={closed || !openForRegistration}
            onClick={() => onOpenChange(true)}
            className="inline-flex items-center justify-between gap-6 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-wider text-sm hover:bg-[#EEEDE9] dark:hover:bg-[#2C2A26] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{!openForRegistration ? '报名未开放' : closed ? '报名已截止' : registration?.status === 'cancelled' ? '重新报名' : '立即报名'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <a href={loginHref} className="inline-flex items-center justify-between gap-6 bg-white text-[#171717] px-6 py-4 font-black uppercase tracking-wider text-sm hover:bg-[#EEEDE9] dark:hover:bg-[#2C2A26]">
            <span>{!openForRegistration ? '报名未开放' : closed ? '报名已截止' : '登录后报名'}</span><ArrowRight className="w-4 h-4" />
          </a>
        )}

        {openForRegistration && hackathon.registrationUrl && (
          <a href={hackathon.registrationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-between border border-white/30 px-4 py-3 text-xs font-bold text-white/80 hover:bg-white/10">
            <span>{hackathon.registrationLabel || '访问活动外部页面'}</span><ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        )}
        {activeRegistration && activeRegistration.status !== 'cancelled' && (
          <button type="button" onClick={() => setConfirmCancel(true)} className="self-start inline-flex items-center min-h-[32px] px-2 -ml-2 text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white underline underline-offset-4">
            取消报名
          </button>
        )}
      </div>

      <Drawer open={open} onClose={() => onOpenChange(false)} title={`报名 · ${hackathon.title}`} width={560}>
        <RegistrationForm
          hackathonId={hackathon.id}
          fields={hackathon.registrationFields ?? []}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </Drawer>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelMutation.mutateAsync().then(() => undefined)}
        title="确认取消报名？"
        description="取消后需要重新提交报名；已创建的队伍和作品可能受影响。"
        confirmText="确认取消"
      />
    </>
  );
}

function RegistrationStatus({ registration, onOpenParticipation }: { registration: ParticipantRegistration; onOpenParticipation: () => void }) {
  const approved = isApproved(registration);
  const review = registration.reviewStatus;
  const label = review ? REVIEW_LABELS[review] : '报名成功';
  return (
    <div className="border border-white/30 bg-white/10 p-4">
      <div className="flex items-center gap-2 font-black text-sm">
        <CheckCircle2 className="w-4 h-4" /> 报名状态 · {label}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/60">
        {approved ? '你已获得参赛资格，可以组队并提交作品。' : review === 'rejected' ? '本次报名未通过审核。' : review === 'waitlisted' ? '你目前在候补名单中，请留意审核通知。' : '报名已提交，审核结果将在这里更新。'}
      </p>
      {registration.reviewNote && <p className="mt-3 border-l-2 border-white/40 pl-3 text-xs text-white/80">审核备注：{registration.reviewNote}</p>}
      {approved && (
        <button type="button" onClick={onOpenParticipation} className="mt-4 inline-flex w-full items-center justify-between bg-white text-[#171717] px-4 py-3 text-xs font-black uppercase tracking-wider">
          进入参赛中心 <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function RegistrationForm({ hackathonId, fields, onSuccess, onCancel }: { hackathonId: string; fields: HackathonFormField[]; onSuccess: () => void; onCancel?: () => void }) {
  const [answers, setAnswers] = useState<RegistrationAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useApiMutation({
    mutationFn: (payload: RegistrationAnswers) => participantApi.register(hackathonId, payload),
    successMessage: '报名已提交',
    invalidateKeys: [
      ['hackathon-registration', hackathonId],
      ['hackathon', hackathonId],
    ],
    onSuccess,
  });

  const setAnswer = (id: string, value: RegistrationAnswer) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setErrors((current) => ({ ...current, [id]: '' }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      const value = answers[field.id];
      const empty = value == null || (typeof value === 'string' ? !value.trim() : typeof value === 'number' ? false : Array.isArray(value) ? value.length === 0 : !value.key);
      if (field.required && empty) nextErrors[field.id] = `请填写${field.label}`;
      if (typeof value === 'string' && field.maxLength && value.length > field.maxLength) nextErrors[field.id] = `最多输入 ${field.maxLength} 个字符`;
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    mutation.mutate(answers);
  };

  return (
    // noValidate: 关闭浏览器原生校验提示(英文气泡), 统一走下方中文行内错误 + aria-invalid
    <form onSubmit={submit} noValidate className="p-5 space-y-5">
      <p className="text-xs leading-relaxed text-[#525252] dark:text-[#A8A6A0]">带 * 为必填项。提交后可在本页查看审核状态。</p>
      {fields.length === 0 && <p className="border border-[#D8D6CF] bg-[#F5F4F0] dark:bg-[#0D0C0A] p-4 text-sm">组织者未设置附加问题，确认提交即可完成报名。</p>}
      {fields.map((field) => (
        <RegistrationField
          key={field.id}
          hackathonId={hackathonId}
          field={field}
          value={answers[field.id]}
          error={errors[field.id]}
          onChange={(value) => setAnswer(field.id, value)}
        />
      ))}
      <Button type="submit" fullWidth size="lg" isLoading={mutation.isPending}>提交报名</Button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full py-2.5 text-xs font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] hover:text-[#171717] dark:hover:text-[#F5F4F0] transition-colors">
          取消
        </button>
      )}
    </form>
  );
}

const inputClass = 'w-full border border-[#A9A79F] bg-white dark:bg-[#1A1916] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#171717] aria-[invalid=true]:border-red-700';

function RegistrationField({ hackathonId, field, value, error, onChange }: {
  hackathonId: string;
  field: HackathonFormField;
  value: RegistrationAnswer | undefined;
  error?: string;
  onChange: (value: RegistrationAnswer) => void;
}) {
  const describedBy = error ? `${field.id}-error` : undefined;
  const common = {
    id: field.id,
    name: field.id,
    required: field.required,
    'aria-invalid': !!error,
    'aria-describedby': describedBy,
  };
  const label = <label htmlFor={field.id} className="block mb-2 text-xs font-black uppercase tracking-wider">{field.label}{field.required && <span className="ml-1" aria-hidden="true">*</span>}</label>;

  if (field.type === 'file') {
    const files = value && !Array.isArray(value) && typeof value !== 'string' && typeof value !== 'number' ? [value] : [];
    return (
      <AttachmentUpload
        hackathonId={hackathonId}
        scope="hackathon-application-file"
        label={field.label}
        files={files}
        required={field.required}
        error={error}
        onUploaded={(file) => onChange(file)}
        onRemove={() => onChange(null)}
      />
    );
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset aria-describedby={describedBy}>
        <legend className="mb-2 text-xs font-black uppercase tracking-wider">{field.label}{field.required && <span className="ml-1" aria-hidden="true">*</span>}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {field.options?.map((option) => (
            <label key={option} className="flex items-center gap-2 border border-[#D8D6CF] bg-white dark:bg-[#1A1916] px-3 py-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name={field.id}
                value={option}
                checked={selected.includes(option)}
                aria-invalid={!!error}
                onChange={() => onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])}
              />{option}
            </label>
          ))}
        </div>
        {error && <p id={describedBy} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      </fieldset>
    );
  }

  return (
    <div>
      {label}
      {field.type === 'textarea' ? (
        <textarea {...common} className={`${inputClass} min-h-28 resize-y`} placeholder={field.placeholder} maxLength={field.maxLength} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
      ) : field.type === 'select' ? (
        <select {...common} className={inputClass} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">{field.placeholder || '请选择'}</option>
          {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
          className={inputClass}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(field.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value)}
        />
      )}
      {error && <p id={describedBy} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
