import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

// Postgres/PostgREST 的 unique_violation 错误码，对应 favorites 表的
// favorites_user_id_post_id_key 唯一约束（见
// supabase/migrations/20260716000200_create_favorites_table.sql）。
const UNIQUE_VIOLATION_CODE = "23505";

export interface AddFavoriteInput {
  userId: string;
  postId: string;
}

export interface RemoveFavoriteInput {
  userId: string;
  postId: string;
}

/**
 * 返回某个用户收藏的所有帖子 id，用来判断某个帖子是否已被当前用户收藏。
 * 越权保护交给 favorites 表自己的 RLS（favorites_select_own），这里不重复判断。
 */
export async function listFavoritedPostIds(userId: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient()
    .from("favorites")
    .select("post_id")
    .eq("user_id", userId);

  if (error) {
    throw new AppError(error.message, "FAVORITES_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => row.post_id);
}

/**
 * 收藏一个帖子。favorites_user_id_post_id_key 唯一约束保证同一用户不会
 * 重复收藏同一帖子；双击/多标签页竞态导致的重复提交在数据库层面会撞上
 * 这个约束（错误码 23505），这里把它当成"已经收藏成功"处理，不向上抛错，
 * 只有其他类型的错误才包装成 AppError 抛出。
 */
export async function addFavorite(input: AddFavoriteInput): Promise<void> {
  const payload: TablesInsert<"favorites"> = {
    user_id: input.userId,
    post_id: input.postId
  };

  const { error } = await getSupabaseClient().from("favorites").insert(payload);

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return;
    }
    throw new AppError(error.message, "FAVORITE_ADD_FAILED", error);
  }
}

/**
 * 取消收藏。favorites 表没有软删除字段（见迁移文件说明：这张表只是用户
 * 关系记录，物理删除即可），所以这里直接 delete 对应行。
 */
export async function removeFavorite(input: RemoveFavoriteInput): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("favorites")
    .delete()
    .match({ user_id: input.userId, post_id: input.postId });

  if (error) {
    throw new AppError(error.message, "FAVORITE_REMOVE_FAILED", error);
  }
}
