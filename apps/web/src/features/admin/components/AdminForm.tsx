/**
 * AdminForm — 公共 brutalist 表单 helpers
 *
 * 解决 admin page 间 BrutalField / BrutalSelect / BrutalButton 复制粘贴 4 份的痛点
 * (AdminHackathons / AdminBadges / AdminUsers / AdminCourses / AdminDegrees 各 1 份)。
 *
 * 风格:跟既有 brutalist helpers 完全一致 — 黑白硬边、无圆角、tracking-widest,
 *     dark mode 适配(neutral-100 / neutral-50 / neutral-800)。
 *
 * 用法:
 *   <AdminField label="标题" value={form.title} onChange={(v) => setForm({...form, title: v})} required />
 *   <AdminSelect label="状态" value={...} onChange={...} options={[{value,label}]} />
 *   <AdminTextarea label="描述" value={...} onChange={...} rows={4} />
 *   <AdminButton variant="primary" size="md" onClick={...}>保存</AdminButton>
 *   <AdminButton variant="danger" onClick={...}>删除</AdminButton>
 */
import type { ReactNode } from 'react';

export type AdminButtonVariant = 'primary' | 'secondary' | 'danger';
export type AdminButtonSize = 'sm' | 'md';

// =============================================================
// AdminField — text / number input + textarea
// =============================================================
export function AdminField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  multiline,
  disabled,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 mb-2 flex items-center gap-1">
        {label}
        {required && <span className="text-red-600">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 text-sm text-[#171717] dark:text-neutral-50 focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 transition-colors resize-none disabled:opacity-50"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 text-sm text-[#171717] dark:text-neutral-50 focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 transition-colors disabled:opacity-50"
        />
      )}
    </div>
  );
}

// =============================================================
// AdminSelect — select 下拉
// =============================================================
export function AdminSelect({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 mb-2 flex items-center gap-1">
        {label}
        {required && <span className="text-red-600">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className="w-full px-4 py-3 bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 text-sm text-[#171717] dark:text-neutral-50 focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800 transition-colors disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================
// AdminButton — primary / secondary / danger
// =============================================================
export function AdminButton({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center font-black uppercase tracking-widest transition-colors disabled:opacity-50';
  const sizeCls = size === 'sm' ? 'px-4 py-2 text-[10px]' : 'px-6 py-3 text-xs';
  const variantCls = {
    primary: 'bg-[#171717] text-white hover:bg-[#262626]',
    secondary:
      'border border-[#171717] text-[#171717] hover:bg-[#EEEDE9] dark:border-neutral-50 dark:text-neutral-50 dark:hover:bg-neutral-800',
    danger:
      'border border-[#171717] text-[#171717] hover:bg-[#171717] hover:text-white dark:border-neutral-50 dark:text-neutral-50',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizeCls} ${variantCls} ${className}`}
    >
      {children}
    </button>
  );
}

// =============================================================
// AdminLabel — 小标题(用于表单内分组)
// =============================================================
export function AdminLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 mb-2 block">
      {children}
    </label>
  );
}
