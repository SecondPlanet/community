import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      // P1-4: 切回标签页不重拉。CourseListPage 等列表页 staleness 已 30s,
      // 切回时 refetch 会让用户看到骨架屏闪烁。后台 refetch 仍然开(refetchInterval 可按需加)。
      refetchOnWindowFocus: false,
    },
  },
});
