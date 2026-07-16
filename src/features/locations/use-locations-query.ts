import { useQuery } from "@tanstack/react-query";

import {
  listActiveLocations,
  type LocationListItem
} from "../../repositories/locations-repository";

// 地区配置不常变化，staleTime 设长一些，和 use-categories-query.ts 一致。
const LOCATIONS_STALE_TIME_MS = 5 * 60 * 1000;

export function useLocationsQuery() {
  return useQuery<LocationListItem[]>({
    queryKey: ["locations"],
    queryFn: listActiveLocations,
    staleTime: LOCATIONS_STALE_TIME_MS
  });
}
