import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "../types/database.generated";
import { AppError } from "../utils/app-error";

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  content: string;
  authorDisplayName: string;
  createdAt: string;
  isDeleted: boolean;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  author: { display_name: string } | null;
}

/**
 * 一次性拉出某个帖子下的全部评论（含已软删除的），前端自己用
 * build-comment-tree.ts 拼成树——这一轮不做分页、不做 Realtime，见任务
 * 范围说明。
 *
 * 故意不过滤 deleted_at：已删除的评论也要占着它在回复链里的位置（软删除
 * 是为了不让子回复变成孤儿，见 create_comments_table 迁移），这里老实把
 * 数据全部返回、只把 deleted_at !== null 映射成 isDeleted 这个布尔值，
 * 至于"已删除的评论不展示真实 content/authorDisplayName"是组件层的展示
 * 逻辑，不应该在 repository 这一层就悄悄清空字段——那样会让这份数据在
 * 语义上变得不完整，也没有必要（真实内容本来就没有敏感到需要在网络层就
 * 藏起来，comments_select_of_approved_or_own_posts 这条 RLS 策略本身就
 * 允许读到这一行的全部列）。
 *
 * 按 created_at 升序：评论是对话，读者预期从早到晚，跟
 * comments_post_id_created_at_idx 这个索引的排序方向一致。
 */
export async function listPostComments(postId: string): Promise<Comment[]> {
  const { data, error } = await getSupabaseClient()
    .from("comments")
    .select(
      "id, post_id, user_id, parent_id, content, created_at, deleted_at, author:profiles(display_name)"
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .overrideTypes<CommentRow[]>();

  if (error) {
    throw new AppError(error.message, "COMMENTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    parentId: row.parent_id,
    content: row.content,
    authorDisplayName: row.author?.display_name ?? "未知用户",
    createdAt: row.created_at,
    isDeleted: row.deleted_at !== null
  }));
}

export interface CreateCommentInput {
  postId: string;
  userId: string;
  parentId: string | null;
  content: string;
}

export interface CreateCommentResult {
  id: string;
  createdAt: string;
}

// Postgres/PostgREST 的 insufficient_privilege 错误码，comments_insert_own
// 这条 RLS 策略的 with check 有好几个独立条件（user_id = auth.uid()、账号
// 不受限、帖子当前对这个用户可见、parent_id 要么是 null 要么指向同一
// post_id 下的已有评论），42501 分不清具体是哪一个失败——不像
// posts-repository.ts/reports-repository.ts 里的 createPost/createReport
// 那样，那两处唯一可能失败的条件实际上只剩账号受限一种（其余条件在正常
// 客户端调用下必然成立），可以放心归因；这里 parent_id/帖子可见性都是
// 真实可能在正常使用中失败的场景（比如帖子在评论输入过程中被下架、或者
// 回复的评论被删除后 parent 关系失效的极端时序），不能简单说"一定是账号
// 受限"，所以统一包装成一条通用失败提示，不精确区分原因。
const RLS_VIOLATION_CODE = "42501";
const COMMENT_FORBIDDEN_MESSAGE = "评论发表失败，请稍后重试。";

export async function createComment(
  input: CreateCommentInput
): Promise<CreateCommentResult> {
  const payload: TablesInsert<"comments"> = {
    post_id: input.postId,
    user_id: input.userId,
    parent_id: input.parentId,
    content: input.content
  };

  const { data, error } = await getSupabaseClient()
    .from("comments")
    .insert(payload)
    .select("id, created_at")
    .single();

  if (error) {
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(COMMENT_FORBIDDEN_MESSAGE, "COMMENT_CREATE_FORBIDDEN", error);
    }
    throw new AppError(error.message, "COMMENT_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("发表评论后无法读取评论 ID。", "COMMENT_CREATE_ID_MISSING");
  }

  return { id: data.id, createdAt: data.created_at };
}

const COMMENT_NOT_FOUND_MESSAGE = "评论不存在或没有权限删除。";

/**
 * 用户软删除自己的评论：把 deleted_at 设成当前时间，不做真正的 DELETE
 * （保留回复链，见 create_comments_table 迁移）。
 *
 * `.eq("id", commentId).eq("user_id", userId)` 这个 UPDATE 即使
 * comments_delete_own 这条 RLS 策略把目标行过滤掉（评论不存在、不是
 * 当前用户的、或者已经被删过），Supabase 也只会静默影响 0 行、`error`
 * 仍然是 null——这个仓库已经在别处吃过"以为 UPDATE 成功了、其实什么都
 * 没发生"的教训（见 posts-repository.ts 那四个作者自助操作方法上方的
 * 大段注释），照抄同一个防御写法：UPDATE 后面接 `.select("id").maybeSingle()`
 * 确认真的改到了一行，`data` 是 null 就当成失败处理。
 */
export async function softDeleteComment(
  commentId: string,
  userId: string
): Promise<void> {
  const payload: TablesUpdate<"comments"> = {
    deleted_at: new Date().toISOString()
  };

  const { data, error } = await getSupabaseClient()
    .from("comments")
    .update(payload)
    .eq("id", commentId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "COMMENT_DELETE_FAILED", error);
  }
  if (!data) {
    throw new AppError(COMMENT_NOT_FOUND_MESSAGE, "COMMENT_DELETE_FAILED");
  }
}
