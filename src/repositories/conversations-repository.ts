import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

export interface CreateDirectConversationResult {
  conversationId: string;
}

export interface ConversationListItem {
  id: string;
  postId: string | null;
  postTitle: string | null;
  /** 相对于当前登录用户，对方的身份——买家还是卖家。 */
  otherPartyRole: "buyer" | "seller";
  /** last_message_at 为空时退回 created_at，用作列表排序的依据。 */
  lastActivityAt: string;
}

interface ConversationListRow {
  id: string;
  post_id: string | null;
  created_by: string;
  last_message_at: string | null;
  created_at: string;
  // 未加别名，字段名跟着嵌套查询里的表名 posts 走（跟
  // posts-repository.ts 里 location:locations(name) 那种带别名的写法
  //不同，这里没有理由起别名，直接用 posts）。post_id 为 null 时（会话
  // 不挂在任何帖子下）这里也是 null；post_id 不为 null 但当前查看者被
  // posts 的 RLS 挡住读不到那一行时（比如帖子还没 approved 且不是本人
  // 发的），PostgREST 同样会把这个嵌套字段返回 null，两种情况在这里
  // 无法/也不需要区分，统一当成"没有标题可显示"处理。
  posts: { title: string } | null;
}

/**
 * 当前登录用户参与的所有会话，供 /messages 会话列表页使用。
 *
 * 越权保护交给 conversations 表自己的 SELECT 策略
 * （conversations_select_member，见 20260716000400 / 20260717000000 两份
 * 迁移）——policy 已经保证 select * from conversations 只会返回当前用户是
 * 成员的会话，这里不需要再显式 join/过滤 conversation_members。
 *
 * otherPartyRole 的判断不需要查 conversation_members：V1 的 direct 会话
 * 只有买卖双方两个成员，买家固定是 conversations.created_by（唯一的创建
 * 入口 create_direct_conversation() 里买家身份就是发起者），所以只要拿
 * created_by 跟 currentUserId 比较，就能推出"对方"是买家还是卖家，不需要
 * 额外一次查询、也不需要拉全部成员列表。
 *
 * 排序：产品要求"按 last_message_at 倒序排列，为空则用 created_at"。
 * PostgREST 的 .order() 只能按一个真实列排序，没法表达"某列为空时退回
 * 另一列"这种 coalesce 语义（除非专门加一个数据库视图/函数，这次任务
 * 明确说不做）。这里选择的折中方案：数据库按 created_at 取回（这一步的
 * 顺序其实无所谓，反正下面会用 lastActivityAt 重新排一次），排序逻辑放
 * 在这个仓库函数里用 JS 完成。当前阶段每个用户的会话数量预期很小，
 * 客户端排序足够用；如果以后会话数量变大，需要把排序（连同分页）下沉到
 * 数据库层——这是一个刻意记录下来的简化，不是遗漏。
 */
export async function listMyConversations(
  currentUserId: string
): Promise<ConversationListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("conversations")
    .select("id, post_id, created_by, last_message_at, created_at, posts(title)")
    .order("created_at", { ascending: false })
    .overrideTypes<ConversationListRow[]>();

  if (error) {
    throw new AppError(error.message, "CONVERSATIONS_LIST_FAILED", error);
  }

  const items: ConversationListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    postId: row.post_id,
    postTitle: row.posts?.title ?? null,
    otherPartyRole: row.created_by === currentUserId ? "seller" : "buyer",
    lastActivityAt: row.last_message_at ?? row.created_at
  }));

  items.sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  );

  return items;
}

/**
 * 创建（或获取已有的）"买家联系某个帖子发布者"的私聊会话。
 *
 * 唯一合法入口是数据库里的 create_direct_conversation(target_post_id) 这个
 * security definer 函数（见迁移文件
 * supabase/migrations/20260716000400_create_messaging_tables.sql）——买家
 * 身份固定从函数内部的 auth.uid() 取，这里不接受、也不传递调用方指定的
 * buyer id，卖家身份由函数内部按 target_post_id 查 posts.author_id 决定。
 * conversations / conversation_members 两张表都没有开放直接 INSERT 的 RLS
 * 策略，所以这里必须走 rpc，不能用 .from("conversations").insert(...)。
 *
 * 函数在"帖子不存在/已删除"或"买家就是帖子作者自己"等情况下会抛出 Postgres
 * 异常，PostgREST 把它转成 { data: null, error } 返回，这里统一包装成
 * AppError，不尝试解析具体是哪一种失败原因（UI 只需要一个通用的失败提示）。
 */
export async function createDirectConversation(
  postId: string
): Promise<CreateDirectConversationResult> {
  const { data, error } = await getSupabaseClient().rpc(
    "create_direct_conversation",
    { target_post_id: postId }
  );

  if (error) {
    throw new AppError(error.message, "CONVERSATION_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError(
      "创建会话后无法读取会话 ID。",
      "CONVERSATION_CREATE_ID_MISSING"
    );
  }

  return { conversationId: data };
}
