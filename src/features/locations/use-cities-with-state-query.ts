import { useQuery } from "@tanstack/react-query";

import {
  listActiveCitiesWithState,
  type LocationWithStateItem
} from "../../repositories/locations-repository";

// 跟 use-locations-query.ts / use-activity-regions-query.ts 一致，地区配置
// 不常变化，staleTime 长一些。
const CITIES_WITH_STATE_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 06 号卡「地区选择」页专用：带 state_code 的城市列表，用于按州分组
 * 展示（见 region-select-page.tsx）。跟 useLocationsQuery 查同一个
 * queryFn 底层的数据源，但 queryKey 不同（多选了一列），互不影响缓存。
 */
export function useCitiesWithStateQuery() {
  return useQuery<LocationWithStateItem[]>({
    queryKey: ["locations", "with-state"],
    queryFn: listActiveCitiesWithState,
    staleTime: CITIES_WITH_STATE_STALE_TIME_MS
  });
}
