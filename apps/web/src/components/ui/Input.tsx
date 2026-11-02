/**
 * Input — P0-4 基础组件
 *
 * 支持:
 *   - label(顶部) / hint(底部辅助) / error(底部红字)
 *   - leftIcon / rightIcon
 *   - 受控(value/onChange) + 非受控(defaultValue) 都支持
 *   - forwardRef 暴露原生 <input> ref
 *   - dark mode 走 token(bg-neutral-0 / border-neutral-200)
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: InputSize;
  fullWidth?: boolean;
}

const sizeClass: Record<InputSize, string> = {
  sm: 'h-8 text-sm px-3',
  md: 'h-10 text-sm px-4',
  lg: 'h-12 text-base px-4',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leftIcon,
    rightIcon,
    size = 'md',
    fullWidth = false,
    disabled,
    className,
    id,
    required,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const hasError = Boolean(error);

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-neutral-900 dark:text-neutral-900"
        >
          {label}
          {required && <span className="text-danger-500 ml-1">*</span>}
        </label>
      )}
      <div
        className={cn(
          'relative flex items-center rounded-md border transition-colors',
          'bg-neutral-0 dark:bg-neutral-0',
          hasError
            ? 'border-danger-500 focus-within:ring-2 focus-within:ring-danger-500/30'
            : 'border-neutral-200 focus-within:border-[#171717] focus-within:ring-2 focus-within:ring-[#171717]/20',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {leftIcon && (
          <span
            className="pl-3 text-neutral-600 dark:text-neutral-600 inline-flex shrink-0"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-full bg-transparent outline-none',
            'text-neutral-900 placeholder:text-neutral-400',
            'dark:text-neutral-900 dark:placeholder:text-neutral-600',
            sizeClass[size],
            leftIcon && 'pl-2',
            rightIcon && 'pr-2',
            className,
          )}
          {...rest}
        />
        {rightIcon && (
          <span
            className="pr-3 text-neutral-600 dark:text-neutral-600 inline-flex shrink-0"
          >
            {rightIcon}
          </span>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-neutral-600 dark:text-neutral-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
