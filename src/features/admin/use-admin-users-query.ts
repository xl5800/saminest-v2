import { useQuery } from "@tanstack/react-query";

import {
  type AdminProfileListItem,
  listProfilesForAdmin
} from "../../repositories/profiles-repository";

/**
 * 管理员账号管理列表（/admin/users），支持可选的 searchTerm。queryKey 把
 * searchTerm 拼进去（未填时用 "" 占位），切换搜索词相当于切到一份新的查询
 * 缓存，不需要手动 invalidate——跟 use-all-posts-query.ts 用 statusFilter
 * 拼 queryKey 是同一个模式。
 */
export function useAdminUsersQuery(searchTerm?: string) {
  return useQuery<AdminProfileListItem[]>({
    queryKey: ["admin-users", searchTerm ?? ""],
    queryFn: () => listProfilesForAdmin(searchTerm)
  });
}
