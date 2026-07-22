import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";
import type { PostListItem } from "./posts-repository";

// Postgres/PostgREST 的 unique_violation 错误码，对应 favorites 表的
// favorites_user_id_post_id_key 唯一约束（见
// supabase/migrations/20260716000200_create_favorites_table.sql）。
const UNIQUE_VIOLATION_CODE = "23505";

// Postgres/PostgREST 的 insufficient_privilege 错误码，任何 RLS with check
// 失败都会报这个码——具体为什么这里能把它安全地归因于账号被封禁，见下面
// addFavorite 里的注释。
const RLS_VIOLATION_CODE = "42501";
const ACCOUNT_RESTRICTED_MESSAGE =
  "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

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
    // favorites_insert_own 这条 RLS 策略（见
    // supabase/migrations/20260717000700_account_status_enforcement.sql）的
    // with check 有两个条件：user_id = auth.uid()，以及
    // not is_account_suspended()。42501 是 PostgREST 对"任意 with check
    // 失败"统一返回的错误码，本身分不清是哪个条件失败——但这里的 user_id
    // 只可能来自 input.userId，而 addFavorite 唯一的调用方
    // use-toggle-favorite-mutation.ts 只会传当前登录用户自己的
    // session.user.id（见 favorite-button.tsx），不接受任意/伪造输入，
    // 所以 user_id 这个条件对一个正常工作的客户端来说永远成立。因此对
    // 这个调用点而言，42501 只可能是 is_account_suspended() 失败，可以
    // 放心地映射成一条专门的、可操作的提示，而不是把原始的"违反行级安全
    // 策略"报给用户。
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
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

interface FavoritedPostRow {
  post: {
    id: string;
    title: string;
    price_amount: number | null;
    price_label: string | null;
    currency_code: string;
    created_at: string;
    deleted_at: string | null;
    location: { name: string } | null;
  } | null;
}

/**
 * 收藏列表页（/favorites）用：跟 listFavoritedPostIds（只返回 post_id，
 * 供 FavoriteButton 判断某个帖子是否已被当前用户收藏）不是同一个用途，
 * 不应该合并成一个函数——调用场景和返回形状都不一样，一个只要 id 数组，
 * 一个要完整的帖子展示信息。
 *
 * 用嵌套 select 把帖子字段一起带出来，写法跟 posts-repository.ts 的
 * location:locations(name) 一致。favorites 对 posts 只有 post_id 一个
 * 外键，posts 对 locations 也只有 location_id 一个外键，都不会遇到
 * reports 表对 profiles 有两个外键（reporter_id / reviewer_id）导致的
 * PGRST201（关系不明确）问题，所以这里不需要
 * `posts!favorites_post_id_fkey(...)` 这种消歧写法。
 *
 * 不用 posts!inner 之类的写法在数据库层面过滤已软删除的帖子，而是把
 * deleted_at 一并选出来、在 JS 里过滤：favorites.post_id 有外键约束，
 * 引用的 posts 行不会被物理删除（只会软删除），所以 row.post 不会是
 * null；这里保留 null 判断只是防御性的。多选一列 deleted_at 的开销可以
 * 忽略不计，比引入嵌套资源的 inner-join 过滤语法更直观、也更容易测试。
 */
export async function listFavoritedPosts(userId: string): Promise<PostListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("favorites")
    .select(
      "post:posts(id, title, price_amount, price_label, currency_code, created_at, deleted_at, location:locations(name))"
    )
    .eq("user_id", userId)
    .overrideTypes<FavoritedPostRow[]>();

  if (error) {
    throw new AppError(error.message, "FAVORITED_POSTS_LIST_FAILED", error);
  }

  return (data ?? [])
    .filter(
      (row): row is FavoritedPostRow & { post: NonNullable<FavoritedPostRow["post"]> } =>
        row.post !== null && row.post.deleted_at === null
    )
    .map((row) => ({
      id: row.post.id,
      title: row.post.title,
      priceAmount: row.post.price_amount,
      priceLabel: row.post.price_label,
      currencyCode: row.post.currency_code,
      locationName: row.post.location?.name ?? null,
      createdAt: row.post.created_at
    }));
}
