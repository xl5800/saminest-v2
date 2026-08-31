import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

// create_direct_conversation() 在账号受限时抛出的异常文本，跟
// supabase/migrations/20260717000700_account_status_enforcement.sql 里
// `raise exception 'restricted accounts cannot start a direct
// conversation'` 逐字一致。这个函数是显式 plpgsql raise exception（不是
// RLS with check），不同失败原因有各自不同的文本，PostgREST 把 message
// 原样透传在 error.message 上，所以这里能（也应该）按文本匹配来区分具体
// 原因，不像 posts/favorites/reports/messages 那四个走 RLS with check 的
// 插入操作那样，只能拿到一个分不清原因的 42501 错误码。
const ACCOUNT_RESTRICTED_ERROR_TEXT =
  "restricted accounts cannot start a direct conversation";
const ACCOUNT_RESTRICTED_MESSAGE =
  "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

// create_profile_conversation() 达到每日新建会话上限时抛出的异常文本，
// 跟 supabase/migrations/20260818070309_create_profile_conversation_function.sql
// 里 `raise exception 'daily new conversation limit reached'` 逐字一致——
// 这段英文本身不是给用户看的，纯粹是给这里的 includes() 判断用的标识符。
const DAILY_LIMIT_ERROR_TEXT = "daily new conversation limit reached";
const DAILY_LIMIT_MESSAGE = "你今天主动私信的新用户数量已经达到上限，请明天再试。";

export interface CreateDirectConversationResult {
  conversationId: string;
}

export interface ConversationListItem {
  id: string;
  postId: string | null;
  postTitle: string | null;
  /** 会话是从哪个入口创建的，见 conversations.origin_type 那份迁移。
   *  'system' 这一种没有"对方"（otherUserId 恒为 null，但原因跟"对方已
   *  退出会话"完全不同）——页面侧必须靠这个字段识别系统通知会话，不能
   *  沿用"otherUserId 为 null 就显示'对方'"那条兜底逻辑，两者是不同的
   *  产品含义。 */
  originType: "post" | "activity" | "profile" | "system";
  /** 对方的 user_id；正常情况下（direct 会话恰好两个活跃成员）能唯一
   *  确定，找不到（比如对方已经退出会话，或者本来就是 originType ===
   *  'system' 这种没有对方的会话）时是 null。 */
  otherUserId: string | null;
  otherDisplayName: string | null;
  otherAvatarUrl: string | null;
  /** last_message_at 为空时退回 created_at，用作列表排序的依据。 */
  lastActivityAt: string;
  /** 最后一条消息的预览文字（普通消息用 body，系统通知用
   *  notification_payload 的 summary/title），会话从来没有过消息时为
   *  null——见 add_conversation_last_message_preview 迁移文件里
   *  sync_conversation_last_message_at() 触发器的维护逻辑。 */
  lastMessagePreview: string | null;
  /** 当前用户有没有读过这条会话的最新消息，见下面 computeIsUnread 的
   *  判断逻辑——20 号卡之后，"最后一条消息是不是自己发的"也是这个判断的
   *  一部分，不只是单纯比较时间戳。 */
  isUnread: boolean;
}

interface ConversationListRow {
  id: string;
  post_id: string | null;
  origin_type: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  /** 20 号卡新增列——最后一条消息的发送者，系统通知消息（没有真实发送者）
   *  这一列是 null，见 conversations-repository.ts 顶部 computeIsUnread
   *  的注释、以及对应的迁移文件。 */
  last_message_sender_id: string | null;
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

interface ConversationMemberRow {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
}

interface OtherPartyProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface OtherParty {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface ConversationMemberInfo {
  otherPartyByConversation: Map<string, OtherParty>;
  /** 当前用户自己在每个会话里的 last_read_at，供 listMyConversations 算
   *  isUnread 用。找不到（比如这批会话根本没有查到任何活跃成员行——理论
   *  上不会发生，当前用户自己必然是活跃成员）时不在这个 Map 里出现，调用
   *  方按"当成从没读过"处理，跟 computeIsUnread 的判断口径一致。 */
  ownLastReadAtByConversation: Map<string, string | null>;
}

/**
 * 批量查出这批会话各自的"对方是谁"+当前用户自己的 last_read_at，按
 * conversation_id 拼成两个 Map，跟 reports-repository.ts 的
 * fetchTargetTitles() 是同一个"批量查 + Map 拼装"模式（避免每个会话单独
 * 查一次，N+1）。但这里查询失败时选择往外抛 AppError，不像
 * fetchTargetTitles 那样 try/catch 静默吞掉——标题在举报队列里只是辅助
 * 展示信息，查不到不影响核心功能；而"对方是谁"/"有没有未读"是这个消息
 * 列表的核心内容，查询失败应该让整个列表进入错误态，不应该悄悄显示一屏
 * "未知用户"或者错误的未读状态。
 *
 * 会话列表加未读标记之前，这个函数只关心 user_id !== currentUserId 的那
 * 一条（用于确定对方身份）；conversation_members 这批行里其实本来就带着
 * user_id === currentUserId 的那一条（当前用户自己），之前的实现直接把它
 * 过滤掉了——现在未读判断需要当前用户自己的 last_read_at，这一条正好就在
 * 同一批已经查到的行里，没有理由为了多拿这一列再单独发一次查询，所以这次
 * 把函数改成一次查询、两个 Map 都从这批行里建。
 *
 * 分两步：
 * 1. 查这批会话的 conversation_members（排除 left_at 不为空、已经退出
 *    的），按 conversation_id 分组：user_id !== currentUserId 的那一条
 *    进 otherPartyByConversation 对应的候选 id（V1 的 direct 会话正常情况
 *    下只有两个活跃成员，这样能唯一确定对方；找不到就不在结果 Map 里
 *    出现，调用方据此把 otherUserId 等字段展示成 null，不抛错，这不是
 *    一种失败）；user_id === currentUserId 的那一条直接进
 *    ownLastReadAtByConversation。
 * 2. 收集第 1 步算出的所有 otherUserId，去重后一次性查 profiles，按 id
 *    建索引，再跟第 1 步的结果拼起来。
 */
async function fetchConversationMemberInfo(
  conversationIds: string[],
  currentUserId: string
): Promise<ConversationMemberInfo> {
  const otherUserIdByConversation = new Map<string, string>();
  const ownLastReadAtByConversation = new Map<string, string | null>();
  if (conversationIds.length === 0) {
    return { otherPartyByConversation: new Map(), ownLastReadAtByConversation };
  }

  const client = getSupabaseClient();

  const { data: memberRows, error: memberError } = await client
    .from("conversation_members")
    .select("conversation_id, user_id, last_read_at")
    .in("conversation_id", conversationIds)
    .is("left_at", null)
    .overrideTypes<ConversationMemberRow[]>();

  if (memberError) {
    throw new AppError(memberError.message, "CONVERSATIONS_LIST_FAILED", memberError);
  }

  for (const row of memberRows ?? []) {
    if (row.user_id === currentUserId) {
      ownLastReadAtByConversation.set(row.conversation_id, row.last_read_at);
    } else {
      otherUserIdByConversation.set(row.conversation_id, row.user_id);
    }
  }

  const otherUserIds = [...new Set(otherUserIdByConversation.values())];
  if (otherUserIds.length === 0) {
    return { otherPartyByConversation: new Map(), ownLastReadAtByConversation };
  }

  const { data: profileRows, error: profileError } = await client
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", otherUserIds)
    .overrideTypes<OtherPartyProfileRow[]>();

  if (profileError) {
    throw new AppError(profileError.message, "CONVERSATIONS_LIST_FAILED", profileError);
  }

  const profileById = new Map((profileRows ?? []).map((row) => [row.id, row]));

  const otherPartyByConversation = new Map<string, OtherParty>();
  for (const [conversationId, otherUserId] of otherUserIdByConversation) {
    const profile = profileById.get(otherUserId);
    otherPartyByConversation.set(conversationId, {
      userId: otherUserId,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null
    });
  }
  return { otherPartyByConversation, ownLastReadAtByConversation };
}

/**
 * 会话"未读"判断，跟 hasUnreadSystemNotification() 尾部的判断逐字一致
 * （抽成共享函数，避免同一段判断在文件里写两遍）：
 * - 没有最后一条消息（会话从来没人发过消息）→ 不算未读。
 * - 最后一条消息是当前用户自己发的 → 不算未读——20 号卡修复：改版前这里
 *   只比较时间戳，完全不知道最后一条消息是谁发的，导致用户主动给别人
 *   发消息时，conversations.last_message_at 一更新，自己的
 *   conversation_members.last_read_at 却只在"打开会话页那一刻"更新过
 *   （不会随着"我刚发的这条消息"同步推进），于是自己也被判定成"未读"，
 *   在会话列表里看到自己刚发出去的消息带着红点。这个分支必须排在"从来
 *   没读过"分支之前——一条全新会话里我发的第一条消息，我可能压根没有
 *   `last_read_at`（还没被 markConversationAsRead 标记过），如果先判断
 *   "没读过就算未读"会错误地漏判这种情况。
 * - 有消息、不是自己发的，但从来没读过（last_read_at 为空）→ 算未读。
 * - 否则按时间比较：最后一条消息晚于上次读取时间才算未读。
 *
 * lastMessageSenderId 为 null 代表系统通知消息（messages.sender_id 本来
 * 就允许为空，见 20260818162648 迁移）——null 不会等于任何真实用户的
 * currentUserId，"是不是自己发的"这条判断对系统通知天然是 false，不会
 * 意外抑制掉系统通知本该有的未读红点。
 */
function computeIsUnread(
  lastMessageAt: string | null,
  lastReadAt: string | null,
  lastMessageSenderId: string | null,
  currentUserId: string
): boolean {
  if (!lastMessageAt) return false;
  if (lastMessageSenderId === currentUserId) return false;
  if (!lastReadAt) return true;
  return new Date(lastMessageAt).getTime() > new Date(lastReadAt).getTime();
}

/**
 * 当前登录用户参与的所有会话，供 /messages 会话列表页使用。
 *
 * 越权保护交给 conversations 表自己的 SELECT 策略
 * （conversations_select_member，见 20260716000400 / 20260717000000 两份
 * 迁移）——policy 已经保证 select * from conversations 只会返回当前用户是
 * 成员的会话，这里不需要再显式 join/过滤 conversation_members。
 *
 * 对方是谁（otherUserId/otherDisplayName/otherAvatarUrl）交给
 * fetchConversationMemberInfo() 批量查，不逐条现查——这一版之前用 created_by 跟
 * currentUserId 比较推出"对方是买家还是卖家"，现在要展示真实身份就必须
 * 知道对方的 user_id，created_by 已经不够用了（它只是会话的发起者，不是
 * "对方"本身），所以这里从 1 次查询变成最多 3 次（会话数为 0 时后面两次
 * 直接跳过，不发空数组查询）。当前访问量不大，可以接受；如果以后聊天量
 * 变大需要合并成一次数据库视图/RPC 查询，是另一个话题，这次不做。
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
    .select(
      "id, post_id, origin_type, last_message_at, last_message_preview, last_message_sender_id, created_at, posts(title)"
    )
    .order("created_at", { ascending: false })
    .overrideTypes<ConversationListRow[]>();

  if (error) {
    throw new AppError(error.message, "CONVERSATIONS_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const { otherPartyByConversation, ownLastReadAtByConversation } =
    await fetchConversationMemberInfo(rows.map((row) => row.id), currentUserId);

  const items: ConversationListItem[] = rows.map((row) => {
    const otherParty = otherPartyByConversation.get(row.id) ?? null;
    const ownLastReadAt = ownLastReadAtByConversation.get(row.id) ?? null;
    return {
      id: row.id,
      postId: row.post_id,
      postTitle: row.posts?.title ?? null,
      originType: row.origin_type as ConversationListItem["originType"],
      otherUserId: otherParty?.userId ?? null,
      otherDisplayName: otherParty?.displayName ?? null,
      otherAvatarUrl: otherParty?.avatarUrl ?? null,
      lastActivityAt: row.last_message_at ?? row.created_at,
      lastMessagePreview: row.last_message_preview,
      isUnread: computeIsUnread(
        row.last_message_at,
        ownLastReadAt,
        row.last_message_sender_id,
        currentUserId
      )
    };
  });

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
 *
 * 16 号卡「对话去重」之后，这个前端函数的调用方式/签名完全没变（依然是
 * "给一个帖子 id，拿回一个会话 id"），变的是数据库函数内部：不再靠
 * (post_id, created_by) 这个部分唯一索引去重（那样换一个帖子、哪怕卖家
 * 是同一个人也会另开一条会话），改成调用共享的
 * get_or_create_direct_conversation()，按"买家-卖家"这一对用户双向查找，
 * 不限来源（帖子/活动/个人主页建的会话都会被找到、复用）。新建的会话
 * post_id 恒为 null——不再把会话绑死在某一个具体帖子上。联系的上下文
 * （因为哪个帖子联系的）这一版不做记录，点"联系"直接进这条会话（新建的
 * 话就是空的，复用的话就是双方已有的聊天记录），不插入任何提示/系统
 * 消息——"关于哪个帖子"这类引用信息如果以后要做，是另一张任务卡的事。
 */
export async function createDirectConversation(
  postId: string
): Promise<CreateDirectConversationResult> {
  const { data, error } = await getSupabaseClient().rpc(
    "create_direct_conversation",
    { target_post_id: postId }
  );

  if (error) {
    if (error.message?.includes(ACCOUNT_RESTRICTED_ERROR_TEXT)) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
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

/**
 * 查找发起人和某个申请人之间已有的会话（P2 报名审核制：发起人同意/拒绝
 * 申请时要反过来通知申请人，见 use-moderate-activity-participant-mutation.ts）。
 *
 * 为什么不能像 createActivityConversation 那样直接调一个 RPC 拿到/建出
 * 会话——create_activity_conversation(target_activity_id) 内部固定把
 * "对方"解析成这场活动的 organizer_id，调用者是谁就把谁和 organizer_id
 * 连起来。申请人申请加入时調用它没问题（调用者是申请人，对方解析成
 * 发起人）；但发起人同意/拒绝申请时如果也调这个函数，调用者（auth.uid()）
 * 和函数内部解析出来的"对方"会是同一个人（发起人自己的活动），直接撞上
 * 函数里"不能和自己建会话"的防御检查而报错——这个函数的设计就没打算支持
 * "发起人主动联系某个参与者"这个方向，仿造一个新 RPC 专门支持这个方向、
 * 或者放宽现有 RPC 接受任意目标用户 id，都会重新打开"可以拉任意用户建
 * 私聊"这个在 P0 阶段特意堵上的口子（见 create_activity_conversation 那份
 * 迁移文件的说明），所以这里换一个不需要新 RPC 的思路：直接查
 * conversation_members 表找"申请人和发起人是不是同一条会话的成员"。
 *
 * 申请人申请加入时触发的 notifyOrganizer 已经用
 * create_activity_conversation 建好（或复用了一条已有）会话，并把发起人
 * 也拉进了 conversation_members（该 RPC 内部一次完成两步）。这条会话本来
 * 就存在，发起人已经是成员，可以直接用 sendMessage() 往里面发消息
 * （messages_insert_own_as_active_member 这条 RLS 只要求 sender_id =
 * auth.uid() 且是这个会话的活跃成员，不要求 sender 是会话创建者）——不需要
 * 新建会话，只需要"找到"它。
 *
 * 16 号卡「对话去重」之后查找方式改了一处关键的地方：不再要求
 * created_by = 申请人、post_id 为空——两个人之间现在只会有一条 direct
 * 会话（不管最初是通过帖子/活动/个人主页哪个入口建的、也不管是谁先发起
 * 联系的，见 get_or_create_direct_conversation() 那份迁移），所以查找
 * 必须是双向的、不限来源：先查申请人参与的所有会话，再看发起人是不是
 * 也在其中某一条里，不能再假设"申请人是这条会话的 created_by"或者"这条
 * 会话没有挂在任何帖子下"——这两个假设在改版前成立（当时活动会话是
 * 唯一一种 post_id 为空的会话），改版后不再成立：比如发起人之前已经通过
 * 帖子联系过这个申请人，这次报名会复用那条会话，created_by 是发起人、
 * post_id 也可能是 null（新建的都是 null）或者历史遗留的某个帖子 id，
 * 原来那两个过滤条件在这种情况下会漏掉它。
 *
 * 分两步（conversation_members_select_of_own_conversations 这条 RLS
 * "能看到同一会话里的其它成员，不只是自己那一行"保证第二步能查到）：
 *   1. 查申请人参与的所有会话 id。
 *   2. 在这批候选里，找一条发起人也是成员的——16 号卡保证同一对用户之间
 *      最多只有一条未软删除的 direct 会话，.maybeSingle() 是安全的。
 *   3. 确认这条会话确实是 type = 'direct' 且未软删除（conversation_members
 *      本身不区分会话软删除状态，这一步在 conversations 表上单独确认）。
 *
 * 找不到时返回 null（不抛错）——调用方把这个当成"没有已有会话可以发通知"，
 * 静默跳过，不阻塞同意/拒绝这个核心操作本身，见
 * use-moderate-activity-participant-mutation.ts 的 notifyApplicant。
 * 这是这个实现方式的已知局限：如果申请人当初申请时，
 * create_activity_conversation 那一步因为网络问题失败了（notifyOrganizer
 * 本身是 best-effort、失败只 console.error，不会重试），这里就找不到
 * 会话，发起人处理申请时也就发不出"被同意/拒绝了"这条通知——这个概率
 * 很低（申请这个核心操作和建会话这个副作用几乎总是一起成功或都还没
 * 发生网络问题的中间状态），但不是不可能，比起为了这个边缘情况新增一个
 * RPC，选择接受这个已知的小概率静默失败。
 */
export async function findExistingActivityConversation(input: {
  applicantUserId: string;
  organizerUserId: string;
}): Promise<{ conversationId: string } | null> {
  const client = getSupabaseClient();

  const { data: applicantMemberships, error: applicantError } = await client
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", input.applicantUserId)
    .overrideTypes<{ conversation_id: string }[]>();

  if (applicantError) {
    throw new AppError(
      applicantError.message,
      "ACTIVITY_CONVERSATION_LOOKUP_FAILED",
      applicantError
    );
  }

  const candidateIds = (applicantMemberships ?? []).map((row) => row.conversation_id);
  if (candidateIds.length === 0) {
    return null;
  }

  const { data: organizerMembership, error: organizerError } = await client
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", input.organizerUserId)
    .in("conversation_id", candidateIds)
    .maybeSingle();

  if (organizerError) {
    throw new AppError(
      organizerError.message,
      "ACTIVITY_CONVERSATION_LOOKUP_FAILED",
      organizerError
    );
  }
  if (!organizerMembership) {
    return null;
  }

  const { data: conversation, error: conversationError } = await client
    .from("conversations")
    .select("id")
    .eq("id", organizerMembership.conversation_id)
    .eq("type", "direct")
    .is("deleted_at", null)
    .maybeSingle();

  if (conversationError) {
    throw new AppError(
      conversationError.message,
      "ACTIVITY_CONVERSATION_LOOKUP_FAILED",
      conversationError
    );
  }

  return conversation ? { conversationId: conversation.id } : null;
}

/**
 * 创建（或获取已有的）"活动报名/退出通知"私聊会话——"一起去"功能第二批
 * 用（报名/退出活动时提醒发起人，见 activities-repository.ts /
 * use-toggle-activity-participation-mutation.ts）。
 *
 * 不能直接复用上面的 createDirectConversation：那个函数唯一合法入口
 * create_direct_conversation(target_post_id) 硬绑定 posts 表（函数体内
 * `select author_id from public.posts where id = target_post_id`），
 * conversations.post_id 外键也只指向 posts，活动（activities 表）不是
 * posts，没有任何路径能让那个函数认得"活动的发起人是谁"，传活动 id 进去
 * 会直接落进它的"post % not found"报错分支。conversations /
 * conversation_members 两张表又完全没有对 authenticated 角色开放任何
 * 直接 INSERT 的 RLS 策略（详见 20260716000400_create_messaging_tables.sql
 * 的说明），所以在不新增数据库对象的前提下，没有办法为活动场景创建会话。
 *
 * 这里新增的 create_activity_conversation(target_activity_id) 是一个和
 * create_direct_conversation 同构的 security definer 函数（见迁移文件
 * supabase/migrations/20260815070000_create_activity_conversation_function.sql），
 * 卖家/买家的等价身份（这里是"发起人"/"操作者"）同样固定从函数内部解析，
 * 不接受调用方指定；这次没有修改/复用 create_direct_conversation 本身
 * （不给它加"帖子或活动通用"的可选参数），避免让一个只服务 posts 场景的
 * 函数意外多出一条永远不会触发的判断分支，迁移文件里有更完整的取舍说明。
 *
 * 错误处理跟 createDirectConversation 完全一致（同一段账号受限判断文本、
 * 同一套 AppError 包装方式），只是错误码前缀换成 ACTIVITY_CONVERSATION_
 * 以区分调用来源，方便日后排查是哪个入口报的错。
 *
 * 16 号卡「对话去重」：跟 createDirectConversation 同一批改动——数据库
 * 函数内部改成调用共享的 get_or_create_direct_conversation()，按
 * "操作者-发起人"这一对用户双向查找（不再只按 created_by = 操作者这一个
 * 方向，那样如果发起人之前先联系过操作者，这里会漏掉那条已有会话），
 * 也不再局限于"post_id 为空"这个范围，不管这两个人之间的会话最初是从
 * 哪个入口建的都会被找到、复用。不插入任何"关于哪个活动"的提示消息，
 * 找到/建好会话后直接把会话 id 返回给前端跳转过去。这个前端函数本身的
 * 签名/调用方式不变。
 */
export async function createActivityConversation(
  activityId: string
): Promise<CreateDirectConversationResult> {
  const { data, error } = await getSupabaseClient().rpc(
    "create_activity_conversation",
    { target_activity_id: activityId }
  );

  if (error) {
    if (error.message?.includes(ACCOUNT_RESTRICTED_ERROR_TEXT)) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "ACTIVITY_CONVERSATION_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError(
      "创建会话后无法读取会话 ID。",
      "ACTIVITY_CONVERSATION_CREATE_ID_MISSING"
    );
  }

  return { conversationId: data };
}

/**
 * 创建（或获取已有的）"个人主页点头像发消息"私聊会话——社交资料页第一批
 * 新入口，跟 createDirectConversation（绑定帖子）/createActivityConversation
 * （绑定活动）不同，这里可以对任意其它用户发起，所以数据库那侧
 * （create_profile_conversation，见迁移文件
 * supabase/migrations/20260818070309_create_profile_conversation_function.sql）
 * 带了每日新建会话限流，这里额外识别这个限流错误、换成对用户友好的中文
 * 提示，不直接把 'daily new conversation limit reached' 这段英文抛给用户看。
 *
 * 结构照抄 createActivityConversation（同一套 rpc 调用 + AppError 包装
 * 方式），错误处理在账号受限判断旁边多一段限流判断，其它未知失败原因
 * 统一落到通用的 PROFILE_CONVERSATION_CREATE_FAILED。
 *
 * 16 号卡「对话去重」：这个函数本来就是三个入口里唯一一开始就做对了
 * "双向查找已有会话"的（见原本的设计要点，一直没有 createDirectConversation/
 * createActivityConversation 那两个的方向性 bug），这次改动只是把查找
 * 范围从"只在 origin_type = 'profile' 里找"放开成"不限来源，两个人之间
 * 任意一条已有 direct 会话都算"——数据库函数内部改成调用共享的
 * find_direct_conversation_between()/create_direct_conversation_row()
 * （原来重复写的那两段 SQL 现在跟另外两个入口共用同一份实现，见
 * get_or_create_direct_conversation() 那份迁移），限流的位置/统计口径
 * 完全不变（依然只统计"真的新建"的 profile 会话，找到已有会话直接返回、
 * 不计入限流）。这个前端函数本身的签名/调用方式不变——15 号卡"发消息"
 * 按钮如果要用这里，直接传目标用户 id 即可。
 */
export async function createProfileConversation(
  targetUserId: string
): Promise<CreateDirectConversationResult> {
  const { data, error } = await getSupabaseClient().rpc(
    "create_profile_conversation",
    { target_user_id: targetUserId }
  );

  if (error) {
    if (error.message?.includes(ACCOUNT_RESTRICTED_ERROR_TEXT)) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    if (error.message?.includes(DAILY_LIMIT_ERROR_TEXT)) {
      throw new AppError(
        DAILY_LIMIT_MESSAGE,
        "PROFILE_CONVERSATION_DAILY_LIMIT_REACHED",
        error
      );
    }
    throw new AppError(error.message, "PROFILE_CONVERSATION_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError(
      "创建会话后无法读取会话 ID。",
      "PROFILE_CONVERSATION_CREATE_ID_MISSING"
    );
  }

  return { conversationId: data };
}

/**
 * 标记某个会话"已读"——conversation-page.tsx 挂载时对任意会话调用（不再
 * 限定系统通知会话，见该文件顶部注释），驱动会话列表每一行的 isUnread
 * 标记。conversation_members_update_self 这条已有 RLS 允许用户自己更新
 * last_read_at，不需要新迁移。
 */
export async function markConversationAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  if (error) {
    throw new AppError(error.message, "CONVERSATION_MARK_READ_FAILED", error);
  }
}

interface SystemConversationRow {
  id: string;
  last_message_at: string | null;
  last_message_sender_id: string | null;
}

/**
 * 底部导航"消息"图标未读红点用：当前用户的系统通知会话是否有比
 * last_read_at 更新的消息。没有系统通知会话（从来没收到过一条系统通知）
 * 时算"没有未读"，不是异常。
 *
 * 拆成两次简单查询（会话本身 + 对应的 conversation_members 那一行），
 * 没有照抄任务卡里 `conversation_members!inner(last_read_at)` 那种单次
 * 嵌套查询——嵌套 embed 在"一对多"方向（一个会话理论上可以有多个成员）
 * 上，PostgREST 返回的是数组还是对象要看具体版本/关系推断，这里没有一个
 * 已登录用户的真实 session 能实际跑一遍确认返回形状；拆成两次都是这个
 * 仓库里已经反复用过的简单形状（.maybeSingle() 拿单行），跟
 * findExistingActivityConversation()/fetchConversationMemberInfo() 是同一个
 * "拆成多个无歧义的简单查询"风格，不需要猜 PostgREST 嵌套 select 的返回
 * 结构，多一次查询的成本对这个"只在底部导航渲染时查一次"的场景可以接受。
 *
 * "有没有比上次读取时间更新的消息"这段判断跟 listMyConversations 给每条
 * 会话算 isUnread 是同一套逻辑，抽成了上面的 computeIsUnread 共享。
 */
export async function hasUnreadSystemNotification(userId: string): Promise<boolean> {
  const client = getSupabaseClient();

  const { data: conversation, error: conversationError } = await client
    .from("conversations")
    .select("id, last_message_at, last_message_sender_id")
    .eq("origin_type", "system")
    .eq("created_by", userId)
    .is("deleted_at", null)
    .maybeSingle()
    .overrideTypes<SystemConversationRow>();

  if (conversationError) {
    throw new AppError(
      conversationError.message,
      "UNREAD_SYSTEM_NOTIFICATION_CHECK_FAILED",
      conversationError
    );
  }
  if (!conversation || !conversation.last_message_at) {
    return false;
  }

  const { data: member, error: memberError } = await client
    .from("conversation_members")
    .select("last_read_at")
    .eq("conversation_id", conversation.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) {
    throw new AppError(
      memberError.message,
      "UNREAD_SYSTEM_NOTIFICATION_CHECK_FAILED",
      memberError
    );
  }

  return computeIsUnread(
    conversation.last_message_at,
    member?.last_read_at ?? null,
    conversation.last_message_sender_id,
    userId
  );
}
