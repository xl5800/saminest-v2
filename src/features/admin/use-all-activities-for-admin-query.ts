import { useQuery } from "@tanstack/react-query";

import {
  type AdminActivityListItem,
  listAllActivitiesForAdmin
} from "../../repositories/activities-repository";

/**
 * 管理员"全部帖子"管理页切到"找搭子"分类时用（"全部帖子"管理页扩展成能
 * 管理所有内容任务卡）。结构照抄 use-all-posts-query.ts：queryKey 把
 * searchQuery 拼进去（未输入时用 "" 占位），切换搜索词相当于切到一份新的
 * 查询缓存，不需要手动 invalidate。
 */
export function useAllActivitiesForAdminQuery(searchQuery?: string) {
  return useQuery<AdminActivityListItem[]>({
    queryKey: ["admin", "all-activities", searchQuery ?? ""],
    queryFn: () => listAllActivitiesForAdmin(searchQuery)
  });
}
