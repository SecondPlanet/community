/**
 * LazyImage — P1-4 公共懒加载图片
 *
 * 解决 audit-frontend-perf-a11y-seo-i18n.md §1 的"6 张 <img> 无 loading=lazy"问题。
 *
 * 行为:
 *   - 默认 loading="lazy" decoding="async"(浏览器原生懒加载)
 *   - 不引新依赖,不引 next/image (本项目是 Vite SPA,不是 Next.js)
 *   - 装饰图(alt="")跳过屏读,描述图保留 alt
 *   - 加载错误时显示一个 fallback placeholder(灰色方块 + 通用 icon)
 *   - loading 状态可选用 onLoad/onError 回调
 *
 * 用法(直接当 <img> 用):
 *   <LazyImage src={course.thumbnail} alt={course.title} className="..." />
 *
 * 注:不引 next/image 这种重组件,保持 Vite SPA 简洁。原生 loading="lazy" 在现代浏览器
 * 覆盖率已经很高,足够实现 audit 要求的"省带宽懒加载图"。
 */
import { useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** 图片源(必填,但用 type 推断可选,跟原生 img 保持一致) */
  src: string;
  /** 描述性 alt。装饰图请传空串 "" 跳过屏读 */
  alt: string;
  /** 是否在视口上方就立即加载(默认 false = 懒加载) */
  eager?: boolean;
  /** 加载失败时 fallback,默认显示 ImageOff icon + 灰色方块 */
  fallback?: React.ReactNode;
  /** 是否在容器内填满 (object-fit: cover) */
  fill?: boolean;
}

export function LazyImage({
  src,
  alt,
  eager = false,
  fallback,
  fill = false,
  className,
  onError,
  ...rest
}: LazyImageProps) {
  const [error, setError] = useState(false);

  if (error) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-neutral-200 text-neutral-500',
          // 与正常图片的 fill 行为一致，留在父容器的布局范围内。
          // absolute inset-0 会在父级忘记 relative 时覆盖整张页面。
          fill && 'h-full w-full',
          className,
        )}
        role="img"
        aria-label={alt || '图片加载失败'}
      >
        <ImageOff className="w-6 h-6" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={(e) => {
        setError(true);
        onError?.(e);
      }}
      className={cn(fill && 'w-full h-full object-cover', className)}
      {...rest}
    />
  );
}
