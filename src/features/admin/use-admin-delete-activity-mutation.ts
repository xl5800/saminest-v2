import { useMutation } from "@tanstack/react-query";

import { adminDeleteActivity } from "../../repositories/admin-repository";

export interface AdminDeleteActivityMutationInput {
  activityId: string;
  deleteReason: string;
}

/**
 * 真正删除一个活动（软删除，走 admin_delete_activity RPC）。不
 * invalidateQueries——理由同 use-delete-post-mutation.ts：唯一调用方
 * all-posts-page.tsx 成功后自己从本地列表移除对应行。"全部帖子"管理页
 * 扩展成能管理所有内容任务卡。
 */
export function useAdminDeleteActivityMutation() {
  return useMutation({
    mutationFn: (input: AdminDeleteActivityMutationInput) =>
      adminDeleteActivity(input.activityId, input.deleteReason)
  });
}
