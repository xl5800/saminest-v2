import { useMutation, useQueryClient } from "@tanstack/react-query";

import { adminDeleteActivity } from "../../repositories/admin-repository";
import type { AdminActivityListItem } from "../../repositories/activities-repository";

export interface AdminDeleteActivityMutationInput {
  activityId: string;
  deleteReason: string;
}

/**
 * 真正删除一个活动（软删除，走 admin_delete_activity RPC）。成功后直接
 * 更新 react-query 缓存里 ["admin","all-activities",...]（见
 * use-all-activities-for-admin-query.ts）的数据，把这一行从缓存数组里
 * 过滤掉，原因同 use-delete-post-mutation.ts——不再依赖唯一调用方
 * all-posts-page.tsx 自己维护一份容易过期的本地列表副本。"全部帖子"
 * 管理页扩展成能管理所有内容任务卡。
 */
export function useAdminDeleteActivityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminDeleteActivityMutationInput) =>
      adminDeleteActivity(input.activityId, input.deleteReason),
    onSuccess: (_data, variables) => {
      queryClient.setQueriesData<AdminActivityListItem[]>(
        { queryKey: ["admin", "all-activities"] },
        (old) => old?.filter((activity) => activity.id !== variables.activityId)
      );
    }
  });
}
