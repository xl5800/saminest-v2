import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

const RLS_VIOLATION_CODE = "42501";
const UNIQUE_VIOLATION_CODE = "23505";
const ACCOUNT_RESTRICTED_MESSAGE = "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

export interface Community {
  id: string;
  name: string;
  slug: string;
}

/**
 * v1 只有一个社区（slug 固定 'dmv'），不在前端硬编码它的 UUID——按 slug
 * 查一次，调用方用 react-query 长期缓存（staleTime 设大一点，这行数据
 * 几乎不会变）。
 */
export async function getCommunityBySlug(slug: string): Promise<Community> {
  const { data, error } = await getSupabaseClient()
    .from("communities")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (error) {
    throw new AppError(error.message, "COMMUNITY_FETCH_FAILED", error);
  }
  return { id: data.id, name: data.name, slug: data.slug };
}

export interface JoinCommunityInput {
  communityId: string;
  userId: string;
}

/**
 * 静默加入社区：community_members 的主键是 (community_id, user_id)，重复
 * 插入会撞主键冲突（23505），跟 addFavorite 的处理方式一样——当成"已经是
 * 成员"直接吞掉，不报错、不提示，调用方不需要关心用户是不是第一次加入。
 */
export async function joinCommunity(input: JoinCommunityInput): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("community_members")
    .insert({ community_id: input.communityId, user_id: input.userId });

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return;
    }
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "COMMUNITY_JOIN_FAILED", error);
  }
}

export type CommunityPostType =
  | "discussion"
  | "question"
  | "help"
  | "recommend"
  | "local_info"
  | "share";

export interface CommunityPostListItem {
  id: string;
  postType: CommunityPostType;
  title: string | null;
  body: string;
  pinned: boolean;
  commentCount: number;
  favoriteCount: number;
  createdAt: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
}

export interface ListCommunityPostsInput {
  communityId: string;
  page: number;
  pageSize: number;
}

export interface ListCommunityPostsResult {
  posts: CommunityPostListItem[];
  hasNextPage: boolean;
}

interface CommunityPostRow {
  id: string;
  post_type: CommunityPostType;
  title: string | null;
  body: string;
  pinned: boolean;
  comment_count: number;
  favorite_count: number;
  created_at: string;
  author_id: string;
  author: { display_name: string; avatar_url: string | null } | null;
}

/**
 * 分页写法照抄 posts-repository.ts 的 listApprovedPosts：range(from, to)
 * 里 to = from + pageSize（多取一条），靠返回行数是否超过 pageSize 判断
 * hasNextPage，不额外发一次 COUNT(*)。
 */
export async function listCommunityPosts(
  input: ListCommunityPostsInput
): Promise<ListCommunityPostsResult> {
  const { communityId, page, pageSize } = input;
  const from = page * pageSize;
  const to = from + pageSize;

  const { data, error } = await getSupabaseClient()
    .from("community_posts")
    .select(
      "id, post_type, title, body, pinned, comment_count, favorite_count, created_at, author_id, author:profiles(display_name, avatar_url)"
    )
    .eq("community_id", communityId)
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to)
    .overrideTypes<CommunityPostRow[]>();

  if (error) {
    throw new AppError(error.message, "COMMUNITY_POSTS_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const hasNextPage = rows.length > pageSize;
  const pageRows = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    posts: pageRows.map((row) => ({
      id: row.id,
      postType: row.post_type,
      title: row.title,
      body: row.body,
      pinned: row.pinned,
      commentCount: row.comment_count,
      favoriteCount: row.favorite_count,
      createdAt: row.created_at,
      authorId: row.author_id,
      authorDisplayName: row.author?.display_name ?? "未知用户",
      authorAvatarUrl: row.author?.avatar_url ?? null
    })),
    hasNextPage
  };
}

export interface CommunityPostDetail extends CommunityPostListItem {
  communityId: string;
}

export async function getCommunityPostDetail(id: string): Promise<CommunityPostDetail> {
  const { data, error } = await getSupabaseClient()
    .from("community_posts")
    .select(
      "id, community_id, post_type, title, body, pinned, comment_count, favorite_count, created_at, author_id, author:profiles(display_name, avatar_url)"
    )
    .eq("id", id)
    .single()
    .overrideTypes<CommunityPostRow & { community_id: string }>();

  if (error) {
    throw new AppError(error.message, "COMMUNITY_POST_DETAIL_FAILED", error);
  }

  return {
    id: data.id,
    communityId: data.community_id,
    postType: data.post_type,
    title: data.title,
    body: data.body,
    pinned: data.pinned,
    commentCount: data.comment_count,
    favoriteCount: data.favorite_count,
    createdAt: data.created_at,
    authorId: data.author_id,
    authorDisplayName: data.author?.display_name ?? "未知用户",
    authorAvatarUrl: data.author?.avatar_url ?? null
  };
}

export interface CreateCommunityPostInput {
  communityId: string;
  authorId: string;
  postType: CommunityPostType;
  title: string | null;
  body: string;
}

export interface CreateCommunityPostResult {
  id: string;
}

/**
 * 调用方（create-community-post-page.tsx）必须保证在调用这个函数之前已经
 * 调用过 joinCommunity 并且成功——到这里时成员身份已经满足，42501 就只可能
 * 是账号受限，跟 createPost/addFavorite 同一套归因逻辑，不是"可能是没加入
 * 社区也可能是账号受限"这种含糊的情况。
 */
export async function createCommunityPost(
  input: CreateCommunityPostInput
): Promise<CreateCommunityPostResult> {
  const payload: TablesInsert<"community_posts"> = {
    community_id: input.communityId,
    author_id: input.authorId,
    post_type: input.postType,
    title: input.title,
    body: input.body
  };

  const { data, error } = await getSupabaseClient()
    .from("community_posts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "COMMUNITY_POST_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("发布后无法读取帖子 ID。", "COMMUNITY_POST_CREATE_ID_MISSING");
  }

  return { id: data.id };
}
