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
  /** 对方的 user_id；正常情况下（direct 会话恰好两个活跃成员）能唯一
   *  确定，找不到（比如对方已经退出会话）时是 null。 */
  otherUserId: string | null;
  otherDisplayName: string | null;
  otherAvatarUrl: string | null;
  /** last_message_at 为空时退回 created_at，用作列表排序的依据。 */
  lastActivityAt: string;
}

interface ConversationListRow {
  id: string;
  post_id: string | null;
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

interface ConversationMemberRow {
  conversation_id: string;
  user_id: string;
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

/**
 * 批量查出这批会话各自的"对方是谁"，按 conversation_id 拼成一个 Map，
 * 跟 reports-repository.ts 的 fetchTargetTitles() 是同一个"批量查 +
 * Map 拼装"模式（避免每个会话单独查一次，N+1）。但这里查询失败时选择
 * 往外抛 AppError，不像 fetchTargetTitles 那样 try/catch 静默吞掉——
 * 标题在举报队列里只是辅助展示信息，查不到不影响核心功能；而"对方是谁"
 * 是这个消息列表的核心内容，查询失败应该让整个列表进入错误态，不应该
 * 悄悄显示一屏"未知用户"。
 *
 * 分两步：
 * 1. 查这批会话的 conversation_members（排除 left_at 不为空、已经退出
 *    的），按 conversation_id 分组，找出 user_id !== currentUserId 的
 *    那一条——V1 的 direct 会话正常情况下只有两个活跃成员，这样能唯一
 *    确定对方。找不到（比如对方已经退出）就不在结果 Map 里出现，调用方
 *    据此把 otherUserId 等字段展示成 null，不抛错，这不是一种失败。
 * 2. 收集第 1 步算出的所有 otherUserId，去重后一次性查 profiles，按 id
 *    建索引，再跟第 1 步的结果拼起来。
 */
async function fetchOtherParties(
  conversationIds: string[],
  currentUserId: string
): Promise<Map<string, OtherParty>> {
  const otherUserIdByConversation = new Map<string, string>();
  if (conversationIds.length === 0) {
    return new Map();
  }

  const client = getSupabaseClient();

  const { data: memberRows, error: memberError } = await client
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", conversationIds)
    .is("left_at", null)
    .overrideTypes<ConversationMemberRow[]>();

  if (memberError) {
    throw new AppError(memberError.message, "CONVERSATIONS_LIST_FAILED", memberError);
  }

  for (const row of memberRows ?? []) {
    if (row.user_id !== currentUserId) {
      otherUserIdByConversation.set(row.conversation_id, row.user_id);
    }
  }

  const otherUserIds = [...new Set(otherUserIdByConversation.values())];
  if (otherUserIds.length === 0) {
    return new Map();
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

  const result = new Map<string, OtherParty>();
  for (const [conversationId, otherUserId] of otherUserIdByConversation) {
    const profile = profileById.get(otherUserId);
    result.set(conversationId, {
      userId: otherUserId,
      displayName: profile?.display_name ?? null,
      avatarUrl: profile?.avatar_url ?? null
    });
  }
  return result;
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
 * fetchOtherParties() 批量查，不逐条现查——这一版之前用 created_by 跟
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
    .select("id, post_id, last_message_at, created_at, posts(title)")
    .order("created_at", { ascending: false })
    .overrideTypes<ConversationListRow[]>();

  if (error) {
    throw new AppError(error.message, "CONVERSATIONS_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const otherPartyByConversation = await fetchOtherParties(
    rows.map((row) => row.id),
    currentUserId
  );

  const items: ConversationListItem[] = rows.map((row) => {
    const otherParty = otherPartyByConversation.get(row.id) ?? null;
    return {
      id: row.id,
      postId: row.post_id,
      postTitle: row.posts?.title ?? null,
      otherUserId: otherParty?.userId ?? null,
      otherDisplayName: otherParty?.displayName ?? null,
      otherAvatarUrl: otherParty?.avatarUrl ?? null,
      lastActivityAt: row.last_message_at ?? row.created_at
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
 * 查找发起人和某个申请人之间"因为一起去活动而建立"的已有会话（P2 报名
 * 审核制：发起人同意/拒绝申请时要反过来通知申请人，见
 * use-moderate-activity-participant-mutation.ts）。
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
 * 迁移文件的说明），这次任务明确"数据库已完成，不用碰"，不新增数据库
 * 对象，所以这里换一个不需要新 RPC 的思路：
 *
 * 申请人申请加入时触发的 notifyOrganizer 已经用
 * create_activity_conversation 建好了一条"申请人 created_by、post_id
 * 为空"的会话，并把发起人也拉进了 conversation_members（该 RPC 内部一次
 * 完成两步）。这条会话本来就存在，发起人已经是成员，可以直接用
 * sendMessage() 往里面发消息（messages_insert_own_as_active_member 这条
 * RLS 只要求 sender_id = auth.uid() 且是这个会话的活跃成员，不要求
 * sender 是会话创建者）——不需要新建会话，只需要"找到"它。
 *
 * 查找方式：conversations 表只记录了 created_by（申请人），没有直接存
 * "对方是谁"这一列，所以分两步：
 *   1. 查所有 created_by = 申请人、type=direct、post_id 为空（排除跟帖子
 *      绑定的会话，避免误把一个不相关的二手交易私聊当成活动会话）的会话
 *      id——申请人可能对不同发起人分别建过这类会话，所以可能不止一条。
 *   2. 在这批候选会话里，找一条发起人也是成员的——conversation_members_
 *      select_of_own_conversations 这条 RLS（"能看到同一会话里的其它
 *      成员，不只是自己那一行"）保证发起人能读到自己所在会话的其它成员，
 *      这一步能查到。
 * create_activity_conversation 自己的"获取或创建"逻辑保证同一对（申请人,
 * 发起人）之间最多只有一条这类会话，所以第 2 步用 .maybeSingle() 是安全
 * 的，不会因为命中多行而报错。
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
  createdByUserId: string;
  otherUserId: string;
}): Promise<{ conversationId: string } | null> {
  const { data: candidates, error: candidatesError } = await getSupabaseClient()
    .from("conversations")
    .select("id")
    .eq("type", "direct")
    .is("post_id", null)
    .is("deleted_at", null)
    .eq("created_by", input.createdByUserId)
    .overrideTypes<{ id: string }[]>();

  if (candidatesError) {
    throw new AppError(
      candidatesError.message,
      "ACTIVITY_CONVERSATION_LOOKUP_FAILED",
      candidatesError
    );
  }

  const candidateIds = (candidates ?? []).map((row) => row.id);
  if (candidateIds.length === 0) {
    return null;
  }

  const { data: member, error: memberError } = await getSupabaseClient()
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", input.otherUserId)
    .in("conversation_id", candidateIds)
    .maybeSingle();

  if (memberError) {
    throw new AppError(memberError.message, "ACTIVITY_CONVERSATION_LOOKUP_FAILED", memberError);
  }

  return member ? { conversationId: member.conversation_id } : null;
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
