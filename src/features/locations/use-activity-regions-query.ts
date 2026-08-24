import { useQuery } from "@tanstack/react-query";

import {
  listActiveActivityRegions,
  type LocationWithStateItem
} from "../../repositories/locations-repository";

// 跟 use-locations-query.ts 一致，配置基本不变，staleTime 长一些。
const ACTIVITY_REGIONS_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 找搭子（活动）发起表单用的"州"选择器数据源，跟发帖用的
 * useLocationsQuery（城市级）是两个独立的 queryKey/查询函数，不共用——
 * 两边查的是同一张 locations 表的不同 type 子集，语义上是两种不同的数据。
 *
 * 12 号卡起，create-activity-page.tsx 不再直接把这份列表渲染成原生
 * <select>（地区选择跳转 /region-select?mode=form 统一处理），只用它
 * 反查"选中的 stateCode 对应哪一行 locations.id"，提交时要用，见
 * create-activity-page.tsx 消费 pendingRegion 的地方。
 */
export function useActivityRegionsQuery() {
  return useQuery<LocationWithStateItem[]>({
    queryKey: ["activity-regions"],
    queryFn: listActiveActivityRegions,
    staleTime: ACTIVITY_REGIONS_STALE_TIME_MS
  });
}
