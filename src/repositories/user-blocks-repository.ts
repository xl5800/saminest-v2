import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

// Postgres/PostgREST 的 unique_violation 错误码，对应
// user_blocks_blocker_blocked_unique_idx 这条唯一索引（见
// supabase/migrations/20260822010000_create_user_blocks_table.sql）。
const UNIQUE_VIOLATION_CODE = "23505";

/**
 * "我（blockerId）有没有屏蔽这个人（blockedId）"——user-profile-page.tsx
 * 的"屏蔽此人/取消屏蔽"按钮用这个判断按钮当前该显示哪个文案。
 *
 * 这是一次单向查询，user_blocks_select_own 这条 RLS（blocker_id =
 * auth.uid()）天然保证只能查到"我发起的屏蔽"，不需要额外传参限定
 * blockerId 必须是当前用户——但这里仍然要求调用方显式传 blockerId 并且
 * 用它做过滤条件，是为了让这个函数的签名本身就表达清楚"查的是谁屏蔽谁"，
 * 不是因为不信任 RLS，跟这个仓库其它地方"RLS 已经兜底、仍然显式传
 * userId 过滤"的一贯做法一致（比如 account-deletion-repository.ts 的
 * getMyAccountDeletionStatus）。
 *
 * 不能反过来查"对方有没有屏蔽我"——RLS 只放行读自己发起的屏蔽记录，读
 * 不到 blocker_id 是别人的行。需要判断"我们之间是否存在任一方向的屏蔽
 * 关系"（比如会话详情页要不要提示"无法发送消息"）时，用下面的
 * isBlockedWithUser()，走的是 security definer 的 is_blocked_with() RPC，
 * 不是直接查这张表。
 */
export async function isBlockingUser(blockerId: string, blockedId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from("user_blocks")
    .select("id")
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "USER_BLOCK_STATUS_FETCH_FAILED", error);
  }

  return data !== null;
}

export interface BlockUserInput {
  blockerId: string;
  blockedId: string;
}

/**
 * 屏蔽一个用户。user_blocks_blocker_blocked_unique_idx 唯一约束保证同一
 * 用户不会重复屏蔽同一个人；撞上这个约束（错误码 23505）当成"已经屏蔽
 * 成功"处理，不向上抛错，跟 favorites-repository.ts 的 addFavorite() 是
 * 同一个"重复提交当成功处理"的先例。
 *
 * 不需要单独处理"不能屏蔽自己"这个 42P17/23514 check 约束报错——调用方
 * （user-profile-page.tsx）本来就只在 !isOwnProfile 时才渲染这个按钮，
 * 数据库层的 user_blocks_no_self_block 约束只是防御性的最后一道防线，
 * 正常操作路径下不会真的撞上它，这里跟其它约束失败一样落进通用的
 * USER_BLOCK_CREATE_FAILED，不需要为一个不该发生的路径单独设计文案。
 */
export async function blockUser(input: BlockUserInput): Promise<void> {
  const payload: TablesInsert<"user_blocks"> = {
    blocker_id: input.blockerId,
    blocked_id: input.blockedId
  };

  const { error } = await getSupabaseClient().from("user_blocks").insert(payload);

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return;
    }
    throw new AppError(error.message, "USER_BLOCK_CREATE_FAILED", error);
  }
}

export interface UnblockUserInput {
  blockerId: string;
  blockedId: string;
}

/**
 * 取消屏蔽。user_blocks 没有软删除字段（见迁移文件说明：这张表只是一份
 * 关系记录，不需要保留"曾经屏蔽过又取消"的历史），直接物理删除对应行，
 * 跟 favorites-repository.ts 的 removeFavorite() 是同一个模式。
 */
export async function unblockUser(input: UnblockUserInput): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("user_blocks")
    .delete()
    .match({ blocker_id: input.blockerId, blocked_id: input.blockedId });

  if (error) {
    throw new AppError(error.message, "USER_BLOCK_REMOVE_FAILED", error);
  }
}

export interface BlockedUserListItem {
  blockedUserId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface BlockedUserRow {
  blocked_id: string;
  blocked: { display_name: string; avatar_url: string | null } | null;
}

/**
 * "我（blockerId）屏蔽的全部用户"——13 号卡（"我的"页新增"已屏蔽"管理
 * 入口）新增，供 blocked-users-page.tsx 展示列表用。跟上面 isBlockingUser
 * 是同一条 user_blocks_select_own RLS（blocker_id = auth.uid()）授权，
 * 那个是"查某一对用户之间的关系"，这个是"查我发起的全部屏蔽记录"，
 * 场景不同所以是两个独立函数，不是同一个函数改个参数就能复用的关系。
 *
 * user_blocks 对 profiles 有两个外键（blocker_id/blocked_id），嵌套 select
 * 写 `profiles(display_name)` 时 PostgREST 分不清该走哪一个，会直接报错
 * PGRST201（跟 reports-repository.ts 的 listReportsForModeration 遇到的是
 * 同一个坑），必须显式用
 * `profiles!user_blocks_blocked_id_fkey(...)` 指定走哪一个外键。
 *
 * 按 created_at 倒序（最近屏蔽的排在最前面），跟这个仓库其它列表页
 * （消息列表、举报队列）默认按时间新→旧排序是同一个约定。
 *
 * blocked 为 null（理论上不应该发生——blocked_id 有外键约束、且
 * profiles_select_public_or_self 这条 RLS 即使账号已注销也仍然放行读取，
 * 见 account_deletion_requests 那次改动的说明）时退回"未知用户"文案，
 * 不让这一行因为一次意外的空值而直接报错中断整个列表——跟
 * reports-repository.ts 对 reporter 的 null 兜底是同一个原则。
 */
export async function listMyBlockedUsers(blockerId: string): Promise<BlockedUserListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("user_blocks")
    .select("blocked_id, blocked:profiles!user_blocks_blocked_id_fkey(display_name, avatar_url)")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false })
    .overrideTypes<BlockedUserRow[]>();

  if (error) {
    throw new AppError(error.message, "MY_BLOCKED_USERS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    blockedUserId: row.blocked_id,
    displayName: row.blocked?.display_name ?? "未知用户",
    avatarUrl: row.blocked?.avatar_url ?? null
  }));
}

/**
 * "当前登录用户和 otherUserId 之间是否存在任一方向的屏蔽关系"——走
 * is_blocked_with(uuid) 这个 security definer RPC（见
 * supabase/migrations/20260823000000_restrict_is_blocked_pair_to_caller.sql），
 * 不是直接查 user_blocks 表：user_blocks_select_own 这条 RLS 只放行读
 * blocker_id = auth.uid() 的行，没法用一次直接查询判断"对方有没有屏蔽
 * 我"这个反方向。
 *
 * 这个函数只有一个参数——"我"是谁由数据库从当前请求的 JWT 里自己取
 * （auth.uid()），不接受调用方传入。前身 isBlockedPair(userA, userB)
 * 接受两个任意用户 id，被发现存在越权查询漏洞：任何登录用户都能拿两个
 * 跟自己无关的用户 id 查出他们之间的屏蔽关系，绕开了 user_blocks 表本身
 * 的 RLS（见迁移文件顶部说明）。改成单参数之后，调用方在语法上就不可能
 * 再表达"查任意两个不相关用户之间的关系"这个请求——不是靠调用方自觉
 * 只传自己的 id，是后端根本不接受这个参数。
 *
 * conversation-page.tsx 用这个函数提前判断"当前登录用户和会话对方之间
 * 有没有屏蔽关系"，命中时把输入框换成一条提示文案，而不是让用户输入
 * 内容后才在发送失败时才发现——真正的强制拦截仍然由 messages 表的
 * messages_insert_own_as_active_member 这条 RLS 策略保证，这里只是提前
 * 把已知会失败的操作在前端隐藏掉，属于体验优化，不是唯一的防线。
 */
export async function isBlockedWithUser(otherUserId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("is_blocked_with", {
    other_user_id: otherUserId
  });

  if (error) {
    throw new AppError(error.message, "USER_BLOCKED_PAIR_CHECK_FAILED", error);
  }

  return data ?? false;
}
