import { useQuery } from "@tanstack/react-query";

import {
  listActiveCategories,
  type CategoryListItem
} from "../../repositories/categories-repository";

// 分类配置不常变化，staleTime 设长一些，见 Architecture.md 6.6。
const CATEGORIES_STALE_TIME_MS = 5 * 60 * 1000;

export function useCategoriesQuery() {
  return useQuery<CategoryListItem[]>({
    queryKey: ["categories"],
    queryFn: listActiveCategories,
    staleTime: CATEGORIES_STALE_TIME_MS
  });
}
