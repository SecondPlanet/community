/**
 * SearchInput — P1-3 公共搜索输入
 *
 * 解决 audit-frontend-perf-a11y-seo-i18n.md §2 的"6 个 search input 无 label"问题。
 *
 * 设计:
 *   - 默认 type="search",带原生清除按钮(浏览器自带 X)
 *   - 自动生成 label via useId + htmlFor,可视隐藏 label(只给屏读),placeholder 当视觉提示
 *   - 左侧 Search 图标(可关)
 *   - 受控/非受控都支持(同原生 input)
 *   - 焦点环:自身 focus:ring-2 focus:ring-[#171717] (覆盖 audit §2 "手写 focus:outline-none 不补 ring")
 *   - 大小:sm/md/lg 三档,默认 md
 *   - 无新依赖,内部包装原生 <input>
 *
 * 用法:
 *   <SearchInput
 *     value={q}
 *     onChange={setQ}
 *     placeholder="搜索黑客松..."
 *     ariaLabel="搜索黑客松"
 *   />
 *
 * 范围(Frank P1-3): 替换 6 个手写 <input type="text" /> 搜索框 (AdminUsersPage x2, HackathonListPage, CoursePracticesTab)
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export type SearchInputSize = 'sm' | 'md' | 'lg';

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** 屏读 label(必填,占位符不当 label 用) */
  ariaLabel: string;
  /** 可选:右侧额外内容(eg. ⌘K 提示 / 自定义清除按钮) */
  rightAddon?: ReactNode;
  /** 可选:左侧额外内容(默认显示 Search 图标,传 null 隐藏) */
  leftAddon?: ReactNode;
  /** 显示清除按钮(value 非空时),默认 true */
  showClear?: boolean;
  /** 清除按钮回调,如果不传,默认 onChange('') */
  onClear?: () => void;
  size?: SearchInputSize;
  fullWidth?: boolean;
  /** 自定义 className,会合并到 input 自身 */
  inputClassName?: string;
}

const sizeClass: Record<SearchInputSize, string> = {
  sm: 'h-8 text-xs pl-3 pr-3',
  md: 'h-10 text-sm pl-4 pr-4',
  lg: 'h-12 text-base pl-4 pr-4',
};

const iconSizeClass: Record<SearchInputSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      ariaLabel,
      placeholder,
      rightAddon,
      leftAddon,
      showClear = true,
      onClear,
      size = 'md',
      fullWidth = false,
      className,
      inputClassName,
      value,
      onChange,
      disabled,
      id,
      ...rest
    },
    ref,
  ) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const hasValue = value !== undefined && String(value).length > 0;

    const handleClear = () => {
      if (onClear) {
        onClear();
        return;
      }
      // 默认行为:模拟一个空值的 change event
      if (onChange) {
        const ev = {
          target: { value: '' },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(ev);
      }
    };

    return (
      <div
        className={cn(
          'relative flex items-center bg-white border border-[#171717]',
          'transition-colors focus-within:ring-2 focus-within:ring-[#171717] focus-within:ring-offset-0',
          fullWidth && 'w-full',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        {/* 可视隐藏 label(屏读专属) */}
        <label htmlFor={inputId} className="sr-only">
          {ariaLabel}
        </label>
        {leftAddon !== null && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
            aria-hidden="true"
          >
            {leftAddon ?? <SearchIcon className={iconSizeClass[size]} />}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type="search"
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className={cn(
            'w-full bg-transparent outline-none text-[#171717] placeholder:text-neutral-500',
            sizeClass[size],
            leftAddon !== null && 'pl-9',
            (showClear && hasValue) || rightAddon ? 'pr-9' : '',
            inputClassName,
          )}
          {...rest}
        />
        {(showClear && hasValue) && (
          <button
            type="button"
            onClick={handleClear}
            tabIndex={-1}
            aria-label="清空搜索"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-[#171717] inline-flex items-center justify-center p-0.5"
          >
            <XIcon className={iconSizeClass[size]} />
          </button>
        )}
        {rightAddon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none">
            {rightAddon}
          </span>
        )}
      </div>
    );
  },
);
