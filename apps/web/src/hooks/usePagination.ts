/**
 * usePagination — P1-4 简单分页 hook
 *
 * 解决 audit-frontend-perf-a11y-seo-i18n.md §1 的"课程/学位/黑客松列表无分页"问题。
 *
 * 行为:
 *   - 客户端分页(每页 24 条,可在 pageSize 改)
 *   - 翻页:goto / next / prev,边界 clamp
 *   - 派生:pageItems(当前页数据)、totalPages、hasNext、hasPrev
 *   - 切数据源变化时(total / pageSize 变)重置到第 1 页
 *
 * 范围:CourseListPage / DegreeListPage / HackathonListPage 用同一 hook,样式保留各页原样
 *      (用前后翻页按钮 + 当前/总页 + 计数)。
 *
 * 后续:后端若加 ?page=&limit=,改本 hook 的 pageItems 实现走 slice 即可,API 不动。
 */
import { useEffect, useMemo, useState } from 'react';

export interface UsePaginationResult<T> {
  /** 当前页数据(1-indexed) */
  pageItems: T[];
  /** 当前页(1-indexed) */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 总数据条数 */
  total: number;
  /** 是否有下一页 */
  hasNext: boolean;
  /** 是否有上一页 */
  hasPrev: boolean;
  /** 跳到指定页(自动 clamp 到 [1, totalPages]) */
  goto: (page: number) => void;
  /** 下一页 */
  next: () => void;
  /** 上一页 */
  prev: () => void;
  /** 重置到第 1 页 */
  reset: () => void;
}

export interface UsePaginationOptions {
  pageSize?: number;
  /** 初始页,默认 1 */
  initialPage?: number;
}

export function usePagination<T>(
  items: T[] | undefined | null,
  options: UsePaginationOptions = {},
): UsePaginationResult<T> {
  const { pageSize = 24, initialPage = 1 } = options;
  const safeItems = items ?? [];
  const totalPages = Math.max(1, Math.ceil(safeItems.length / pageSize));
  const [currentPage, setCurrentPage] = useState(() =>
    Math.min(Math.max(1, initialPage), totalPages),
  );

  // 数据源变化(total / pageSize 变)时,如果当前页越界,clamp 回 1
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    } else if (currentPage < 1) {
      setCurrentPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return safeItems.slice(start, start + pageSize);
  }, [safeItems, currentPage, pageSize]);

  return {
    pageItems,
    currentPage,
    totalPages,
    total: safeItems.length,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
    goto: (page: number) => {
      setCurrentPage(Math.min(Math.max(1, page), totalPages));
    },
    next: () => setCurrentPage((p) => Math.min(p + 1, totalPages)),
    prev: () => setCurrentPage((p) => Math.max(p - 1, 1)),
    reset: () => setCurrentPage(1),
  };
}
