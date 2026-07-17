import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

export interface CreateDirectConversationResult {
  conversationId: string;
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
