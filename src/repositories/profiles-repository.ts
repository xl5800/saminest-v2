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

export interface MyProfile {
  displayName: string;
}

/**
 * 只读当前登录用户自己的 display_name，供 /profile 页面展示用（跟
 * getCurrentUserRole 只取 role 一列是同一个"按需只选一列"的原则，不复用
 * 同一个函数——两者用途不同、以后各自演化的字段也可能不同，没必要为了
 * 省一个函数而耦合在一起）。
 *
 * profiles_select_public_or_self 这条已有的 RLS 策略保证任何登录用户都能
 * 读到自己的 profile 行（见上面 getCurrentUserRole 的注释），不需要新增
 * RLS/migration，纯前端新增。
 *
 * 用户不存在（理论上不会发生，但防御性处理）时返回 null，只有真正的
 * Supabase 查询失败才包装成 AppError。
 */
export async function getMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "MY_PROFILE_FETCH_FAILED", error);
  }

  return data ? { displayName: data.display_name } : null;
}

export interface AdminProfileListItem {
  id: string;
  displayName: string;
  email: string;
  role: string;
  accountStatus: string;
  createdAt: string;
}

/**
 * 后台账号管理列表（/admin/users）用：调用 list_profiles_for_admin 这个
 * security definer RPC（见
 * supabase/migrations/20260720000000_list_profiles_for_admin_function.sql），
 * 而不是直接 `.from("profiles").select(...)`——email 存在 auth.users 里，
 * 这张表不在这个项目暴露的 API schema 里（supabase/config.toml 的
 * api.schemas 只有 public / graphql_public），前端没有其它途径拿到邮箱，
 * 必须走这个函数在服务端把 profiles 和 auth.users join 好。
 *
 * search_term 可选，直接透传 searchTerm（undefined 时相当于不传这个
 * key，命中 RPC 参数自己的默认值 `search_term text default null`）——
 * 之前手写的类型桩把这个参数错误地标成 `string | null`，真实生成的类型
 * 是 `search_term?: string`（只接受 undefined/省略，不接受显式 null），
 * 换成真实类型后这里如果还传 `searchTerm ?? null` 会编译不过，改成直接
 * 传 searchTerm 本身。
 * 没有分页参数：函数本身就没有 limit/offset（当前用户规模小，全量列表
 * 已经够用，是刻意的简化，不是遗漏），这里不需要额外处理。
 *
 * RPC 返回的行本身就是扁平结构（不是嵌套 select），只需要把 snake_case
 * 字段名映射成 camelCase，不需要额外的行内 fallback 处理（display_name/
 * email 在 profiles/auth.users 里都是 NOT NULL 列）。
 */
export async function listProfilesForAdmin(
  searchTerm?: string
): Promise<AdminProfileListItem[]> {
  const { data, error } = await getSupabaseClient().rpc("list_profiles_for_admin", {
    search_term: searchTerm
  });

  if (error) {
    throw new AppError(error.message, "ADMIN_PROFILES_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    accountStatus: row.account_status,
    createdAt: row.created_at
  }));
}
