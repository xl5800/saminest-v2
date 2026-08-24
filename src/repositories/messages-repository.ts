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
}

export interface MessageListItem {
  id: string;
  /** 系统通知消息（见 notify_user() 那份迁移）没有真实发送者，是 null——
   *  isMine 判断（conversation-page.tsx）和"连续消息头像分组"逻辑都要
   *  排除这种消息，不能假设它一定是某个用户发的。 */
  senderId: string | null;
  body: string | null;
  /** 只有 senderId 为 null 的系统通知消息才会有值（跟 messages 表的
   *  messages_sender_or_notification_check 约束一一对应），页面据此判断
   *  要不要渲染成通知卡片而不是聊天气泡。 */
  notificationPayload: NotificationPayload | null;
  createdAt: string;
}

interface MessageRow {
  id: string;
  sender_id: string | null;
  body: string | null;
  notification_payload: NotificationPayload | null;
  created_at: string;
}

/**
 * 返回某个会话里未软删除的消息，按 created_at 升序（最早的在最前面），
 * 页面直接按这个顺序渲染即可，不需要在前端再排一次序。越权保护交给
 * messages 表自己的 SELECT 策略（messages_select_of_own_conversations），
 * 这里不重复判断调用者是不是会话成员。
 */
export async function listMessages(conversationId: string): Promise<MessageListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("messages")
    .select("id, sender_id, body, notification_payload, created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .overrideTypes<MessageRow[]>();

  if (error) {
    throw new AppError(error.message, "MESSAGES_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    body: row.body,
    notificationPayload: row.notification_payload ?? null,
    createdAt: row.created_at
  }));
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  body: string;
}

export interface SendMessageResult {
  id: string;
}

/**
 * 发送一条文本消息。message_type 不在这里传——数据库列默认就是 'text'，
 * 且 messages_message_type_check 目前也只允许这一个取值，不需要前端显式
 * 指定。RLS（messages_insert_own_as_active_member）要求 sender_id 必须是
 * 当前登录用户、且当前仍是该会话的有效成员，这里不重复判断，交给数据库层。
 */
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const payload: TablesInsert<"messages"> = {
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body
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
