import { QueryClient } from "@tanstack/react-query";

/**
 * 原生感 A 批：缓存要能存到手机本地、冷启动先显示上次的内容（见
 * query-persistence.ts），所以查询结果在内存里保留 24 小时（gcTime 要不小于
 * 持久化的 maxAge，否则还没存下来就被清掉了）。过期判断（staleTime）不变：
 * 30 秒后再显示就会在后台重新拉一次。
 */
export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: QUERY_CACHE_MAX_AGE_MS,
      retry: 1
    }
  }
});
