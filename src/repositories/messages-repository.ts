import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

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
    throw new AppError(error.message, "MESSAGE_SEND_FAILED", error);
  }
  if (!data) {
    throw new AppError("发送消息后无法读取消息 ID。", "MESSAGE_SEND_ID_MISSING");
  }

  return { id: data.id };
}
