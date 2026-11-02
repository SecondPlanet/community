import type { ReactNode } from 'react';

export const inputClass =
  'w-full px-4 py-3 bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-400 text-sm focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 transition-colors';

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  multiline,
  placeholder,
  min,
  max,
  step,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-neutral-600 mb-2 flex items-center gap-1">
        {label}
        {required && <span className="text-red-600">*</span>}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          required={required}
          placeholder={placeholder}
          className={`${inputClass} resize-y`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          aria-invalid={!!error}
          className={inputClass}
        />
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-neutral-600 mb-2 block">
        {label}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-2 border-[#171717] dark:border-neutral-400 bg-white dark:bg-neutral-100 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export const actionButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#171717] text-white dark:bg-[#F5F4F0] dark:text-[#171717] text-[10px] font-black uppercase tracking-widest whitespace-nowrap hover:bg-[#262626] dark:hover:bg-[#E5E3DC] transition-colors disabled:opacity-50';

export const outlineButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-[#171717] dark:border-neutral-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap hover:bg-[#EEEDE9] dark:hover:bg-neutral-800 transition-colors disabled:opacity-50';

/** 破坏性操作(拒绝报名): 红色描边 + 红字, 与普通次级按钮区分 */
export const dangerButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-danger-500 text-danger-500 text-[10px] font-black uppercase tracking-widest whitespace-nowrap hover:bg-danger-500 hover:text-white transition-colors disabled:opacity-50';
