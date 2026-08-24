import { useMutation } from "@tanstack/react-query";

import { adminCancelActivity } from "../../repositories/admin-repository";

export interface AdminCancelActivityMutationInput {
  activityId: string;
  cancelReason: string;
}

/**
 * 管理员下架一个活动（把 status 改成 cancelled，走 admin_cancel_activity
 * RPC）。不 invalidateQueries——理由同 use-delete-post-mutation.ts：唯一
 * 调用方 reports-page.tsx 成功后自己从本地列表移除对应举报行。命名
 * 加 "admin" 前缀跟 src/repositories/activities-repository.ts 里发起人
 * 自助取消的 cancelActivity()/useCancelActivityMutation 区分开——两者是
 * 完全独立的两条授权路径，不共用同一个 mutation，见
 * supabase/migrations/20260823040000_admin_cancel_activity_function.sql
 * 顶部"关于要不要复用 cancelActivity 现有的实现"的说明。UGC 安全功能补齐
 * 任务卡 4。
 */
export function useAdminCancelActivityMutation() {
  return useMutation({
    mutationFn: (input: AdminCancelActivityMutationInput) =>
      adminCancelActivity(input.activityId, input.cancelReason)
  });
}
