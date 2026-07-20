import { useQuery } from "@tanstack/react-query";

import {
  type AdminCategoryListItem,
  listAllCategoriesForAdmin
} from "../../repositories/categories-repository";

/**
 * 管理员分类管理列表（/admin/categories）。跟 use-admin-users-query.ts 一样
 * 是一份不带筛选参数的简单查询——分类管理页面没有搜索/状态过滤入口。
 */
export function useAdminCategoriesQuery() {
  return useQuery<AdminCategoryListItem[]>({
    queryKey: ["admin-categories"],
    queryFn: listAllCategoriesForAdmin
  });
}
