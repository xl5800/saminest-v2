import { useQuery } from "@tanstack/react-query";

import { listRegionContentCounts } from "../../repositories/locations-repository";

// 内容量级变化不快（不是聊天消息那种秒级更新的数据），跟
// use-activity-regions-query.ts/use-cities-with-state-query.ts 同一档
// staleTime。
const REGION_CONTENT_COUNTS_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 08 号卡「地区选择」页"按热度"排序专用：Map<州代码, 内容数量>。
 * 只有 region-select-page.tsx 一个消费者，不需要下拉框那种"筛选表单可选项"
 * 语义，所以直接暴露 Map 而不是数组——调用方按州代码查一个数字，Map.get()
 * 天然比 Array.find() 更直接。
 */
export function useRegionContentCountsQuery() {
  return useQuery<Map<string, number>>({
    queryKey: ["region-content-counts"],
    queryFn: listRegionContentCounts,
    staleTime: REGION_CONTENT_COUNTS_STALE_TIME_MS
  });
}
