import { useQuery } from "@tanstack/react-query";

import {
  listActiveActivityRegions,
  type LocationListItem
} from "../../repositories/locations-repository";

// 跟 use-locations-query.ts 一致，配置基本不变，staleTime 长一些。
const ACTIVITY_REGIONS_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 找搭子（活动）发起 + 列表筛选用的"州"选择器（DC/VA/MD），跟发帖用的
 * useLocationsQuery（城市级）是两个独立的 queryKey/查询函数，不共用——
 * 两边查的是同一张 locations 表的不同 type 子集，语义上是两种不同的数据。
 */
export function useActivityRegionsQuery() {
  return useQuery<LocationListItem[]>({
    queryKey: ["activity-regions"],
    queryFn: listActiveActivityRegions,
    staleTime: ACTIVITY_REGIONS_STALE_TIME_MS
  });
}
