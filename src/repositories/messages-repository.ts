import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

// Postgres/PostgREST 的 insufficient_privilege 错误码，任何 RLS with check
// 失败都会报这个码——具体为什么这里能把它安全地归因于账号受限，见下面
// sendMessage 里的注释。
const RLS_VIOLATION_CODE = "42501";
const ACCOUNT_RESTRICTED_MESSAGE =
  "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

export interface MessageListItem {
  id: string;
  senderId: string;
  body: string | null;
  createdAt: string;
}

interface MessageRow {
  id: string;
  sender_id: string;
  body: string | null;
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
    .select("id, sender_id, body, created_at")
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
    // supabase/migrations/20260717000700_account_status_enforcement.sql）的
    // with check 有三个条件：sender_id = auth.uid()、当前用户仍是该会话
    // 的有效成员、以及 not is_account_restricted()。42501 是 PostgREST 对
    // "任意 with check 失败"统一返回的错误码，本身分不清是哪个条件失败——
    // 但这里的 sender_id 只可能来自 input.senderId，而 sendMessage 唯一的
    // 调用方 conversation-page.tsx 只会传当前登录用户自己的
    // session.user.id，不接受任意/伪造输入；"是否仍是会话成员"这一条在
    // RequireAuth 保护的 /messages/:conversationId 页面里，用户能看到这个
    // 会话本身就已经隐含了他是成员（会话列表/详情查询都受
    // conversations_select_member 这条 RLS 限制），正常操作路径下不会在
    // 发消息这一步才突然失去成员资格。因此对这个调用点而言，42501 在实践
    // 中只可能是 is_account_restricted() 失败，可以放心地映射成一条专门
    // 的、可操作的提示，而不是把原始的"违反行级安全策略"报给用户。
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "MESSAGE_SEND_FAILED", error);
  }
  if (!data) {
    throw new AppError("发送消息后无法读取消息 ID。", "MESSAGE_SEND_ID_MISSING");
  }

  return { id: data.id };
}
