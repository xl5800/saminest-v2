import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

/**
 * 管理员审核操作，跟 posts-repository.ts / reports-repository.ts 里那些
 * 面向公开流程的函数分开放在这里——这四个函数专门服务后台审核工作流
 * （approve/reject 帖子、resolve/dismiss 举报），不属于任何一个面向普通
 * 用户的仓库文件。
 *
 * 四个函数都只是薄薄地包一层 .rpc()：真正的原子性（改状态 + 记审核日志）
 * 由数据库里的 security definer 函数保证，见
 * supabase/migrations/20260717000300_admin_moderation_actions_functions.sql。
 * 没有直接 UPDATE 的 RLS 入口，这是改变 posts.status /
 * reports.status 到这几个终结状态的唯一合法方式。
 *
 * RPC 在"备注为空"或"目标行不是预期的前置状态（比如已经被处理过）"时会在
 * 数据库里 raise exception，PostgREST 把它转成 { error } 返回，这里统一
 * 包装成一个通用的 AppError，不尝试解析具体是哪种失败原因——UI 只需要
 * 展示一条通用的失败提示，不需要对每种数据库异常分别处理。
 */

export async function approvePost(postId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("approve_post", {
    target_post_id: postId
  });

  if (error) {
    throw new AppError(error.message, "ADMIN_APPROVE_POST_FAILED", error);
  }
}

export async function rejectPost(
  postId: string,
  rejectionNote: string
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("reject_post", {
    target_post_id: postId,
    rejection_note: rejectionNote
  });

  if (error) {
    throw new AppError(error.message, "ADMIN_REJECT_POST_FAILED", error);
  }
}

export async function resolveReport(
  reportId: string,
  resolutionNote: string
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("resolve_report", {
    target_report_id: reportId,
    resolution_note: resolutionNote
  });

  if (error) {
    throw new AppError(error.message, "ADMIN_RESOLVE_REPORT_FAILED", error);
  }
}

export async function dismissReport(
  reportId: string,
  resolutionNote: string
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("dismiss_report", {
    target_report_id: reportId,
    resolution_note: resolutionNote
  });

  if (error) {
    throw new AppError(error.message, "ADMIN_DISMISS_REPORT_FAILED", error);
  }
}

/**
 * 删除帖子（软删除：设置 posts.deleted_at + 记一条 moderation_actions
 * 日志，原子性由 delete_post 这个 security definer 函数保证，见
 * supabase/migrations/20260717000500_delete_post_function.sql）。
 * 参数名 target_post_id / delete_reason 跟该迁移文件里函数签名完全一致，
 * 不是照抄 approve_post/reject_post 的 target_post_id 命名习惯猜的。
 */
export async function deletePost(
  postId: string,
  deleteReason: string
): Promise<void> {
  const { error } = await getSupabaseClient().rpc("delete_post", {
    target_post_id: postId,
    delete_reason: deleteReason
  });

  if (error) {
    throw new AppError(error.message, "ADMIN_DELETE_POST_FAILED", error);
  }
}
