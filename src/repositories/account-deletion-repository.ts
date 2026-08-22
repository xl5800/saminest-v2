import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

export interface AccountDeletionStatus {
  scheduledPurgeAt: string;
}

/**
 * 只读当前登录用户"是否处于注销缓冲期"——存在一条未撤销、未清除的
 * account_deletion_requests 行就算处于缓冲期，返回它的 scheduled_purge_at
 * 供页面算剩余天数；没有就返回 null（正常状态，可以发起注销）。
 *
 * account_deletion_requests_select_self 这条 RLS 策略保证登录用户只能
 * 读到自己的这一行，不需要额外传 userId 做二次过滤——跟 getMyProfile 依赖
 * profiles_select_public_or_self 是同一个思路，这里 .eq("user_id", userId)
 * 仍然显式写出来，是为了让这条查询在没有 RLS 的场景下（比如未来某天
 * 换成 service_role 调用）也不会读到别人的数据，不是因为不信任 RLS。
 */
export async function getMyAccountDeletionStatus(
  userId: string
): Promise<AccountDeletionStatus | null> {
  const { data, error } = await getSupabaseClient()
    .from("account_deletion_requests")
    .select("scheduled_purge_at")
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .is("purged_at", null)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "ACCOUNT_DELETION_STATUS_FETCH_FAILED", error);
  }

  return data ? { scheduledPurgeAt: data.scheduled_purge_at } : null;
}

/**
 * 发起注销：调用 request_account_deletion() 这个 security definer RPC
 * （见 supabase/migrations/20260822000000_account_self_deletion.sql）。
 * 已经存在一条待处理请求时，数据库函数会报错，这里不在前端重复判断
 * （调用方应该先用 getMyAccountDeletionStatus 查一次，只在返回 null 时
 * 展示"注销账号"入口，这里的错误只是防御性兜底）。
 *
 * 返回值是数据库函数算出来的 scheduled_purge_at（now() + 15 天），不在
 * 前端本地用 Date 重新算一遍——避免客户端时钟和数据库时钟不一致导致
 * 显示的到期时间跟数据库里实际生效的值对不上。
 */
export async function requestAccountDeletion(): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("request_account_deletion");

  if (error) {
    throw new AppError(error.message, "ACCOUNT_DELETION_REQUEST_FAILED", error);
  }

  return data;
}

/**
 * 撤销注销：调用 cancel_account_deletion()。没有待处理请求时数据库函数
 * 会报错——正常使用路径下不应该出现（页面只在查到待处理请求时才渲染
 * "撤销注销"按钮），跟 requestAccountDeletion 的防御性错误是同一类情况。
 */
export async function cancelAccountDeletion(): Promise<void> {
  const { error } = await getSupabaseClient().rpc("cancel_account_deletion");

  if (error) {
    throw new AppError(error.message, "ACCOUNT_DELETION_CANCEL_FAILED", error);
  }
}
