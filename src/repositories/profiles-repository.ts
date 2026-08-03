import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

const UNIQUE_VIOLATION_CODE = "23505";
const DEFAULT_PROFILE_DISPLAY_NAME = "新用户";

export interface CreateProfileInput {
  id: string;
  displayName: string;
}

/**
 * 建一行新的 profiles 记录。两处调用：
 * 1. authService.signUp()——项目没开邮箱验证、或者用户已经验证过邮箱时，
 *    signUp 成功后当场就有 session，直接建。
 * 2. ensureProfileExists()（下面）——项目开启邮箱验证时，signUp 阶段
 *    session 是 null，客户端还是匿名身份，这里的 insert 会被 RLS 拒绝
 *    （auth.uid() = id 那条 with check 不满足），只能等用户真正完成邮箱
 *    验证、登录进来拿到有效 session 之后再补建。
 * 两处insert逻辑完全一样，抽成这一个函数共用，不写两份。
 *
 * displayName 传空字符串/纯空白时退回一个默认值，不让这一步因为拿不到
 * 有效昵称（比如 auth 用户 user_metadata 里意外没有 display_name）而
 * 插入一行空显示名，也不因此让整个补建失败。
 */
export async function createProfile(input: CreateProfileInput): Promise<void> {
  const displayName = input.displayName.trim() || DEFAULT_PROFILE_DISPLAY_NAME;
  const payload: TablesInsert<"profiles"> = {
    id: input.id,
    display_name: displayName,
    role: "user",
    account_status: "active"
  };
  const { error } = await getSupabaseClient().from("profiles").insert(payload);

  if (error) {
    throw new AppError(error.message, "PROFILE_CREATE_FAILED", error);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof AppError &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    (error.cause as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}

/**
 * useAuthBootstrap 用：确保当前登录用户在 public.profiles 里有一行记录，
 * 没有就用 createProfile 补建——补上"邮箱验证开启时 authService.signUp()
 * 阶段 session 是 null、profile 从来不会被创建"这个缺口。
 *
 * 先查一次是不是已经存在：老用户每次打开网站都会走一遍 useAuthBootstrap，
 * 绝大多数情况下不应该每次都尝试插入，只有真的查不到时才 insert。
 *
 * 这中间仍然有一个理论上的竞态窗口——两个标签页/两次 onAuthStateChange
 * 几乎同时判断"不存在"、几乎同时插入，profiles.id 是主键，后完成的那次
 * 会撞 23505 唯一冲突。这种情况直接当成"已经建好了"忽略，不当成真正的
 * 失败抛出去——调用方不需要关心这种竞态，只需要知道"这次调用之后 profile
 * 一定存在，或者是真的失败了"。
 */
export async function ensureProfileExists(
  userId: string,
  displayName: string
): Promise<void> {
  const { data: existing, error: selectError } = await getSupabaseClient()
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    throw new AppError(selectError.message, "PROFILE_EXISTS_CHECK_FAILED", selectError);
  }
  if (existing) {
    return;
  }

  try {
    await createProfile({ id: userId, displayName });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return;
    }
    throw error;
  }
}

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
  avatarUrl: string | null;
}

/**
 * 只读当前登录用户自己的 display_name + avatar_url，供 /profile 页面
 * 展示用（跟 getCurrentUserRole 只取 role 一列是同一个"按需只选一列"的
 * 原则，不复用同一个函数——两者用途不同、以后各自演化的字段也可能不同，
 * 没必要为了省一个函数而耦合在一起）。
 *
 * avatar_url 这次一并带出来，是这版"我的"页面视觉规范要求展示一个头像
 * 位——profiles 表本来就有这一列（v1 遗留字段），但整个 v2 目前没有任何
 * 头像上传功能，所以这一列现在总是 null，页面侧要按"没有头像时显示
 * 首字母占位"处理，不能假设它一定有值。真正的头像上传功能是另一个独立
 * 任务，这次只是把已经存在的这一列读出来、把展示位置做对，不在这里顺带
 * 做上传。
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
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "MY_PROFILE_FETCH_FAILED", error);
  }

  return data ? { displayName: data.display_name, avatarUrl: data.avatar_url } : null;
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
