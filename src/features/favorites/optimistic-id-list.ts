import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * 原生感 A 批：收藏点了立即生效（乐观更新）。三种收藏（分类信息帖子、社区帖子、
 * 找搭子活动）的"我收藏了哪些 id"都是一个 string[] 缓存，点的时候先直接改缓存
 * 让星星马上变，请求失败再改回去。返回一个"改回去"的函数，给 onError 用。
 */
export async function toggleIdInCachedList(
  queryClient: QueryClient,
  queryKey: QueryKey,
  id: string,
  shouldContain: boolean
): Promise<() => void> {
  // 先停掉正在进行的同一个查询，免得它的旧结果回来把刚改的状态盖掉。
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<string[]>(queryKey);
  queryClient.setQueryData<string[]>(queryKey, (current = []) => {
    const withoutId = current.filter((item) => item !== id);
    return shouldContain ? [...withoutId, id] : withoutId;
  });
  return () => queryClient.setQueryData<string[]>(queryKey, previous);
}
