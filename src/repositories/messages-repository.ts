import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

// Postgres/PostgREST 的 insufficient_privilege 错误码，任何 RLS with check
// 失败都会报这个码——具体这里能归因到哪些原因、为什么不能再像以前那样
// 断定成单一原因，见下面 sendMessage 里的注释。
const RLS_VIOLATION_CODE = "42501";
const MESSAGE_SEND_FORBIDDEN_MESSAGE =
  "消息未能发送：你的账号可能处于限制状态，或你与对方之间存在屏蔽关系。";

export interface NotificationPayload {
  title: string;
  summary: string | null;
  link: string | null;
  /** 任务卡 4（发起人群发通知参与者）新增，可选——notify_user() 写的
   *  "Saminest 官方系统通知"这一版没有这个字段（值是 undefined），只有
   *  notify_activity_participants() 写的"发起人群发的活动通知"才会带上
   *  'activity_broadcast'，见该迁移文件顶部说明。conversation-page.tsx
   *  据此把两种都满足 notificationPayload !== null 的消息渲染成不同的
   *  卡片样式（📢活动通知 vs 🔔Saminest 通知），不新增列，复用同一个
   *  jsonb 字段。 */
  kind?: "activity_broadcast";
}

// 联系客服改成真聊天任务卡：message-images 是私有桶，图片列存的是 Storage
// 路径（image_path），不是能直接用的地址——跟 feedback_images.public_url
// 那次"存了一个私有桶生成不出来的公开地址，后台从此再也显示不出一张图"
// 的坑不能再踩，这里按需用 createSignedUrl(s) 现签一个有时效的地址，
// 1 小时足够看完一屏聊天记录，过期不影响历史消息本身，只是那张图片的
// 显示地址需要重新签（下次重新加载这个会话时会话页会重新调一次
// listMessages，自然会拿到新的签名地址，不需要专门的续签机制）。
const MESSAGE_IMAGES_BUCKET = "message-images";
const IMAGE_SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 60;

export interface MessageListItem {
  id: string;
  /** 系统通知消息（见 notify_user() 那份迁移）没有真实发送者，是 null——
   *  isMine 判断（conversation-page.tsx）和"连续消息头像分组"逻辑都要
   *  排除这种消息，不能假设它一定是某个用户发的。联系客服改成真聊天
   *  任务卡新增：管理员回复（admin_reply_to_support_conversation() 插入
   *  的那种）senderId 同样是 null，但 notificationPayload 也是
   *  null——页面据此把它跟"系统通知卡片"区分开，渲染成正常的聊天气泡，
   *  见 conversation-page.tsx 的 isAdminReply 判断。 */
  senderId: string | null;
  body: string | null;
  /** 只有 senderId 为 null 的系统通知消息才会有值（跟 messages 表的
   *  messages_sender_or_notification_check 约束一一对应），页面据此判断
   *  要不要渲染成通知卡片而不是聊天气泡。 */
  notificationPayload: NotificationPayload | null;
  /** 联系客服改成真聊天任务卡新增：这条消息附带的图片，已经是能直接用
   *  在 <img src> 上的签名地址（不是 image_path 原始 Storage 路径），
   *  没有图片时是 null。跟 body 至多两者都有、至少一者非空（数据库层
   *  messages_body_or_image_check 约束保证），页面不需要重复校验这条
   *  规则，只需要按"有就展示缩略图"处理。 */
  imageUrl: string | null;
  /** 30 号卡新增：这条消息关联的活动 id——目前只有
   *  use-toggle-activity-participation-mutation.ts 的 notifyOrganizer()
   *  在"申请加入（需要审核）"这一种情况下会填这一列，会话页据此判断"要不要
   *  在这条消息下面加一个'查看申请 →'链接"，不需要解析 body 文本内容找
   *  活动。ref_activity_id 这一列（连同 ref_post_id）是 16 号卡加的，那次
   *  的"联系上下文引用消息"功能后来被撤回、没有实际调用方在写这两列，这次
   *  是第一次真正用起来，见 messages 表建表迁移和
   *  20260826162616_remove_conversation_reference_messages.sql 的历史。 */
  refActivityId: string | null;
  createdAt: string;
}

interface MessageRow {
  id: string;
  sender_id: string | null;
  body: string | null;
  notification_payload: NotificationPayload | null;
  image_path: string | null;
  ref_activity_id: string | null;
  created_at: string;
}

/**
 * 批量给这一批消息的 image_path 现签地址，按 path 建索引供调用方拼装
 * MessageListItem.imageUrl——跟 conversations-repository.ts 里
 * fetchConversationMemberInfo() 是同一个"批量查 + Map 拼装"模式，避免
 * 每条消息各自现签一次（N+1）。单张图片签名失败（比如文件已经在
 * Storage 里被删掉，DB 行还留着）不让整个列表查询失败，只是那一条的
 * imageUrl 退回 null——聊天记录里一张图挂了不应该连累其它文字消息都
 * 显示不出来；createSignedUrls() 这个批量调用本身失败（网络/权限问题）
 * 才当成真正的失败往外抛。
 */
async function resolveImageUrls(imagePaths: string[]): Promise<Map<string, string>> {
  const urlByPath = new Map<string, string>();
  if (imagePaths.length === 0) {
    return urlByPath;
  }

  const { data, error } = await getSupabaseClient()
    .storage
    .from(MESSAGE_IMAGES_BUCKET)
    .createSignedUrls(imagePaths, IMAGE_SIGNED_URL_EXPIRES_IN_SECONDS);

  if (error) {
    throw new AppError(error.message, "MESSAGE_IMAGE_SIGN_FAILED", error);
  }

  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) {
      urlByPath.set(item.path, item.signedUrl);
    }
  }
  return urlByPath;
}

/**
 * 返回某个会话里未软删除的消息，按 created_at 升序（最早的在最前面），
 * 页面直接按这个顺序渲染即可，不需要在前端再排一次序。越权保护交给
 * messages 表自己的 SELECT 策略（messages_select_of_own_conversations，
 * 只允许当前用户是这条会话的成员）。这是普通用户读自己会话消息的正确
 * 路径，不需要、也不应该绕过这条 RLS。
 *
 * 管理员后台的客服会话详情页（admin-support-conversation-page.tsx）不再
 * 复用这个函数——管理员从来不是任何一条客服会话的 conversation_members
 * 行，这条 RLS 对管理员必然不成立（曾经短暂给它开过例外，但那导致了一次
 * 真实的生产数据泄漏，已经撤销且被禁止再开，见
 * 20260921040500_remove_admin_exception_from_conversation_rls.sql）。
 * 管理员改用 adminListSupportConversationMessages()，走
 * admin_list_support_conversation_messages() 这个 security definer
 * 函数，天然绕过 RLS，不依赖、也不需要这条策略给管理员开任何例外。
 */
export async function listMessages(conversationId: string): Promise<MessageListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .select("id, sender_id, body, notification_payload, image_path, ref_activity_id, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .overrideTypes<MessageRow[]>();

  if (error) {
    throw new AppError(error.message, "MESSAGES_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const imagePaths = rows
    .map((row) => row.image_path)
    .filter((path): path is string => path !== null);
  const urlByPath = await resolveImageUrls([...new Set(imagePaths)]);

  return rows.map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    notificationPayload: row.notification_payload ?? null,
    imageUrl: row.image_path ? (urlByPath.get(row.image_path) ?? null) : null,
    refActivityId: row.ref_activity_id,
    createdAt: row.created_at
  }));
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  /** 联系客服改成真聊天任务卡：body 改成可选——一条消息可以只有图片没有
   *  文字（数据库层 messages_body_or_image_check 要求 body/imagePath
   *  至少一个非空，这里不重复校验这条规则，交给数据库层兜底；
   *  conversation-page.tsx 的发送按钮本身也不会在两者都为空时启用）。 */
  body?: string;
  /** 联系客服改成真聊天任务卡新增：这条消息附带图片的 Storage 路径
   *  （不是地址），由 conversation-page.tsx 先调用
   *  messageImageStorageService.uploadMessageImage() 上传成功后再传
   *  进来。一条消息最多一张图，不做多图消息。 */
  imagePath?: string;
  /** 30 号卡新增：可选，只有 notifyOrganizer() 发"申请加入（需要审核）"
   *  这条通知时会传，见 MessageListItem.refActivityId 的注释。不传时列
   *  为 null，跟改版前完全一样。 */
  refActivityId?: string;
}

export interface SendMessageResult {
  id: string;
}

/**
 * 发送一条消息（文字/图片，至少一个非空）。message_type 不在这里传——
 * 数据库列默认就是 'text'，且 messages_message_type_check 目前也只允许
 * 这一个取值，不需要前端显式指定。RLS（messages_insert_own_as_active_member）
 * 要求 sender_id 必须是当前登录用户、且当前仍是该会话的有效成员，这里
 * 不重复判断，交给数据库层。
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const payload: TablesInsert<"messages"> = {
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body ?? null,
    image_path: input.imagePath ?? null,
    ref_activity_id: input.refActivityId ?? null
  };

  const { data, error } = await getSupabaseClient()
    .from("messages")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    // messages_insert_own_as_active_member 这条 RLS 策略（见
    // supabase/migrations/20260717000700_account_status_enforcement.sql，
    // UGC 安全功能补齐任务卡 1 之后又加了第四个条件，见
    // supabase/migrations/20260822020000_enforce_user_blocks_in_messaging.sql）
    // 的 with check 现在有四个条件：sender_id = auth.uid()、当前用户仍是
    // 该会话的有效成员、not is_account_restricted()、以及 not
    // is_blocked_in_conversation(...)。42501 是 PostgREST 对"任意 with
    // check 失败"统一返回的错误码，本身分不清是哪个条件失败。
    //
    // 前两个条件仍然可以用跟以前一样的理由排除：sender_id 只可能来自
    // input.senderId，而 sendMessage 唯一的调用方 conversation-page.tsx
    // 只会传当前登录用户自己的 session.user.id，不接受任意/伪造输入；
    // "是否仍是会话成员"在 RequireAuth 保护的 /messages/:conversationId
    // 页面里，用户能看到这个会话本身就已经隐含了他是成员（会话列表/详情
    // 查询都受 conversations_select_member 这条 RLS 限制），正常操作路径
    // 下不会在发消息这一步才突然失去成员资格。
    //
    // 但账号受限和屏蔽关系这两个条件现在都是真实可能发生的原因，且
    // 42501 本身无法区分——不能再像以前那样把 42501 一律断定成"账号受限"
    // 并展示对应文案（如果真实原因是屏蔽关系，那条文案会误导用户以为是
    // 自己的账号出了问题，去联系管理员也解决不了）。conversation-page.tsx
    // 已经用 useIsBlockedPairQuery 在发送之前主动查出双向屏蔽关系、把
    // 输入框换成提示文案，正常操作路径下走不到这里；这里保留的 42501
    // 分支只是应对"查询结果还没刷新就已经被对方屏蔽/管理员刚限制了账号"
    // 这类竞态兜底，因此改成一条不预设具体原因、但仍然清楚说明"重试没用"
    // 的文案，而不是猜一个可能是错的具体原因。
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(MESSAGE_SEND_FORBIDDEN_MESSAGE, "MESSAGE_SEND_FORBIDDEN", error);
    }
    throw new AppError(error.message, "MESSAGE_SEND_FAILED", error);
  }
  if (!data) {
    throw new AppError("发送消息后无法读取消息 ID。", "MESSAGE_SEND_ID_MISSING");
  }

  return { id: data.id };
}

/**
 * 联系客服改成真聊天任务卡：管理员回复某个客服会话，唯一合法入口是
 * admin_reply_to_support_conversation() 这个 security definer 函数——
 * 不能直接对 messages 表 insert：普通的 sendMessage() 走
 * messages_insert_own_as_active_member 这条 RLS，要求 sender_id =
 * auth.uid() 且当前是会话的活跃成员，管理员两条都不满足（管理员从来
 * 不是任何一条客服会话的 conversation_members 行）。函数内部会校验
 * 调用者是不是管理员、目标会话是不是 support 来源（把"联系客服"拆成
 * 独立会话类型任务卡之后，这个函数只认 support，对 system 会话调用会
 * 报错——system 会话已经不再是双向聊天，见对应迁移文件的说明），这里
 * 不重复判断。
 */
export async function adminReplyToSupportConversation(
  conversationId: string,
  body: string | null,
  imagePath: string | null
): Promise<void> {
  const { error } = await getSupabaseClient().rpc(
    "admin_reply_to_support_conversation",
    {
      target_conversation_id: conversationId,
      // admin_reply_to_support_conversation 的 body 参数在 SQL 里没有默认值
      // （必须传），但类型是可为 null 的 text——生成的类型只能表达"必传"，
      // 表达不出"可以传 null"，这里按实际库函数签名转换类型，不改变运行时
      // 传的值（null 就是 null，原样传给数据库）。
      body: body as string,
      // image_path 同理：SQL 里是 text default null，生成类型只能表达成
      // 可选的 string，表达不出"可以传 null"，这里同样按实际签名转换类型，
      // 原样传 null，不改成 undefined（避免悄悄改变实际传给数据库的值）。
      image_path: imagePath as string | undefined
    }
  );

  if (error) {
    throw new AppError(error.message, "ADMIN_SUPPORT_REPLY_FAILED", error);
  }
}

/**
 * 修复管理员客服会话详情页读不到消息内容的 RLS 缺口任务卡：管理员读取
 * 某个客服会话（origin_type = 'support'）的消息列表，唯一合法入口是
 * admin_list_support_conversation_messages() 这个 security definer
 * 函数——不能直接查 messages 表：普通的 listMessages() 走
 * messages_select_of_own_conversations 这条 RLS，要求当前用户是该会话
 * 的成员，管理员不满足（管理员从来不是任何一条客服会话的
 * conversation_members 行）。函数内部会校验调用者是不是管理员、目标
 * 会话是不是 support 来源，这里不重复判断。跟 listMessages() 返回同一个
 * MessageListItem 形状（同样批量签图片地址），不另建一套返回类型——
 * 页面据此可以直接复用现成的消息渲染逻辑，不需要区分数据来源。
 */
export async function adminListSupportConversationMessages(
  conversationId: string
): Promise<MessageListItem[]> {
  const { data, error } = await getSupabaseClient().rpc(
    "admin_list_support_conversation_messages",
    { target_conversation_id: conversationId }
  );

  if (error) {
    throw new AppError(error.message, "ADMIN_SUPPORT_MESSAGES_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const imagePaths = rows
    .map((row) => row.image_path)
    .filter((path): path is string => path !== null);
  const urlByPath = await resolveImageUrls([...new Set(imagePaths)]);

  return rows.map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    notificationPayload: (row.notification_payload as NotificationPayload | null) ?? null,
    imageUrl: row.image_path ? (urlByPath.get(row.image_path) ?? null) : null,
    refActivityId: row.ref_activity_id,
    createdAt: row.created_at
  }));
}
