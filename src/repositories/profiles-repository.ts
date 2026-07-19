import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

/**
 * 只读某个用户 profiles.role 一列，供 RequireAdmin 判断"当前登录用户是不是
 * 管理员"用（role 是 'admin' / 'super_admin' 时视为管理员，跟数据库
 * is_admin() 函数判断的取值完全一致，见 supabase/migrations 里对 is_admin()
 * 的定义）。
 *
 * 这里没有调用 is_admin() 这个数据库函数——它只是给 RLS 策略内部用的
 * helper，没有 grant execute 给 authenticated，前端不应该假设能通过 .rpc()
 * 调用它。改为直接查 profiles 表：profiles_select_public_or_self 这条已有
 * 的 RLS 策略保证任何登录用户都能读到自己的 profile 行，不需要额外的
 * grant/policy。
 *
 * 用户不存在（理论上不会发生，但防御性处理）时返回 null 而不是抛错，只有
 * 真正的 Supabase 查询失败才包装成 AppError。
 */
export async function getCurrentUserRole(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "PROFILE_ROLE_FETCH_FAILED", error);
  }

  return data?.role ?? null;
}
