import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "../types/database.generated";
import { AppError } from "../utils/app-error";
import { type PostFeedImageRow, resolveCoverImageUrl } from "./posts-repository";

const RLS_VIOLATION_CODE = "42501";
const UNIQUE_VIOLATION_CODE = "23505";
const ACCOUNT_RESTRICTED_MESSAGE = "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

export interface Community {
  id: string;
  name: string;
  slug: string;
  /** 阶段九（社区浏览页卡片）新增：社区简介。DMV 那一行种子数据建表时没有
   *  填 description，目前线上是 null，调用方要自己处理空值。 */
  description: string | null;
  /** 阶段九新增：成员数。communities.member_count 是触发器
   *  （sync_community_member_count）随 community_members 增删维护的计数列，
   *  不用前端自己 count。 */
  memberCount: number;
  /** 阶段十新增：官方社区才显示头部的认证勾。 */
  isOfficial: boolean;
}

/**
 * v1 只有一个社区（slug 固定 'dmv'），不在前端硬编码它的 UUID——按 slug
 * 查一次，调用方用 react-query 长期缓存（staleTime 设大一点，这行数据
 * 几乎不会变）。
 */
export async function getCommunityBySlug(slug: string): Promise<Community> {
  const { data, error } = await getSupabaseClient()
    .from("communities")
    .select("id, name, slug, description, member_count, is_official")
    .eq("slug", slug)
    .single();

  if (error) {
    throw new AppError(error.message, "COMMUNITY_FETCH_FAILED", error);
  }
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    memberCount: data.member_count,
    isOfficial: data.is_official
  };
}

/**
 * 当前用户是不是某个社区的成员——阶段九社区浏览页的"加入/已加入"按钮和
 * "我的社区"Tab 用。community_members 的 SELECT 策略只允许本人（或管理员）
 * 读自己的行，所以这里按 (community_id, user_id) 精确查一行；没有这一行
 * （还没加入）时 maybeSingle 返回 data = null，不是错误。
 */
export async function isCommunityMember(communityId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from("community_members")
    .select("community_id")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "COMMUNITY_MEMBERSHIP_FETCH_FAILED", error);
  }
  return data !== null;
}

/**
 * 某个社区从 sinceIso 起新发布的帖子数（"今日 N 个新帖子"用）。过滤条件跟
 * listCommunityPosts 对外可见的集合保持一致（approved 且未软删除），否则
 * 卡片上写"今日 3 个新帖子"、点进去 Feed 里却只看得到 2 个。head: true 只要
 * 数量不要行，不拉帖子内容。
 */
export async function countCommunityPostsSince(
  communityId: string,
  sinceIso: string
): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from("community_posts")
    .select("id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .eq("status", "approved")
    .is("deleted_at", null)
    .gte("created_at", sinceIso);

  if (error) {
    throw new AppError(error.message, "COMMUNITY_POST_COUNT_FAILED", error);
  }
  return count ?? 0;
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
  /** 封面图（sort_order 最小的未软删除图片），没有图片时是 null——Feed 卡片
   *  此时保持纯文字样子，不渲染占位块。 */
  coverImageUrl: string | null;
  /** 全部未软删除图片的 public_url，按 sort_order 升序。Feed 卡片和详情页都用
   *  这个字段渲染图片轮播（coverImageUrl 保留，Feed 列表不再使用它）。 */
  images: string[];
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
  // community_post_images 的列名跟 post_images 逐字一致（见阶段五迁移），所以
  // 直接复用 posts-repository.ts 的 PostFeedImageRow / resolveCoverImageUrl。
  community_post_images: PostFeedImageRow[] | null;
}

/**
 * 把内嵌查询出来的 community_post_images 整理成"全部未软删除图片 URL，按
 * sort_order 升序"。列表和详情共用，查询本身已经把这些行带回来了，不需要额外
 * 请求。
 */
function mapPostImageUrls(rows: PostFeedImageRow[] | null): string[] {
  return (rows ?? [])
    .filter((image) => image.deleted_at === null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((image) => image.public_url)
    .filter((publicUrl): publicUrl is string => publicUrl !== null);
}

/**
 * 图片：内嵌 select community_post_images(public_url, sort_order, deleted_at)，
 * 不在 SQL 层面 .limit(1, { foreignTable })——原因见 posts-repository.ts 里
 * resolveCoverImageUrl 上面的大段注释（软删除 + 重新上传历史下，SQL 层面限到
 * 一条会选错封面图）。取全部之后在 JS 里用 resolveCoverImageUrl 选封面。
 *
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
      "id, post_type, title, body, pinned, comment_count, favorite_count, created_at, author_id, author:profiles(display_name, avatar_url), community_post_images(public_url, sort_order, deleted_at)"
    )
    .eq("community_id", communityId)
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "community_post_images", ascending: true })
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
      authorAvatarUrl: row.author?.avatar_url ?? null,
      coverImageUrl: resolveCoverImageUrl(row.community_post_images),
      images: mapPostImageUrls(row.community_post_images)
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
      "id, community_id, post_type, title, body, pinned, comment_count, favorite_count, created_at, author_id, author:profiles(display_name, avatar_url), community_post_images(public_url, sort_order, deleted_at)"
    )
    .eq("id", id)
    .order("sort_order", { foreignTable: "community_post_images", ascending: true })
    .single()
    .overrideTypes<CommunityPostRow & { community_id: string }>();

  if (error) {
    throw new AppError(error.message, "COMMUNITY_POST_DETAIL_FAILED", error);
  }

  const images = mapPostImageUrls(data.community_post_images);

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
    authorAvatarUrl: data.author?.avatar_url ?? null,
    coverImageUrl: resolveCoverImageUrl(data.community_post_images),
    images
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

export interface MyCommunityPostListItem {
  id: string;
  postType: CommunityPostType;
  title: string | null;
  body: string;
  status: string;
  commentCount: number;
  favoriteCount: number;
  createdAt: string;
}

interface MyCommunityPostRow {
  id: string;
  post_type: CommunityPostType;
  title: string | null;
  body: string;
  status: string;
  comment_count: number;
  favorite_count: number;
  created_at: string;
}

/**
 * "我的社区发帖"管理页用：只查当前用户自己、未被软删除的帖子，按 created_at
 * 降序——跟 my-posts-page.tsx 对自己帖子列表的排序方向一致。显式带
 * `deleted_at is null`：作者自己的 SELECT 策略不一定把软删除的行挡掉，不能
 * 靠 RLS 保证"已删除的帖子不再出现在自己的列表里"。
 */
export async function listMyCommunityPosts(authorId: string): Promise<MyCommunityPostListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("community_posts")
    .select("id, post_type, title, body, status, comment_count, favorite_count, created_at")
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .overrideTypes<MyCommunityPostRow[]>();

  if (error) {
    throw new AppError(error.message, "MY_COMMUNITY_POSTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    postType: row.post_type,
    title: row.title,
    body: row.body,
    status: row.status,
    commentCount: row.comment_count,
    favoriteCount: row.favorite_count,
    createdAt: row.created_at
  }));
}

export interface UpdateCommunityPostInput {
  id: string;
  authorId: string;
  postType: CommunityPostType;
  title: string | null;
  body: string;
}

const COMMUNITY_POST_NOT_EDITABLE_MESSAGE = "帖子不存在，或没有权限编辑。";
const COMMUNITY_POST_NOT_DELETABLE_MESSAGE = "帖子不存在，或没有权限删除。";

/**
 * 普通 UPDATE，不是 RPC——community_posts_update_own_or_admin 这条 RLS 策略
 * 的作者分支本来就允许改 title/body/post_type，不需要新的数据库对象。
 *
 * UPDATE 后面接 `.select("id").maybeSingle()` 确认真的改到了一行（跟
 * posts-repository.ts 那几个作者自助操作、comments-repository.ts 的
 * softDeleteComment 同一个防御写法）：RLS 把目标行过滤掉时 Supabase 只会
 * 静默影响 0 行、error 仍然是 null，不能只看 error 判断成功。.eq("id").
 * .eq("author_id") 过滤完一行都没有（帖子不存在、不是自己的、已经被删了）
 * 时 data 是 null，抛 COMMUNITY_POST_UPDATE_FAILED，不当成静默成功。
 */
export async function updateCommunityPost(input: UpdateCommunityPostInput): Promise<void> {
  const payload: TablesUpdate<"community_posts"> = {
    post_type: input.postType,
    title: input.title,
    body: input.body
  };

  const { data, error } = await getSupabaseClient()
    .from("community_posts")
    .update(payload)
    .eq("id", input.id)
    .eq("author_id", input.authorId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "COMMUNITY_POST_UPDATE_FAILED", error);
  }
  if (!data) {
    throw new AppError(COMMUNITY_POST_NOT_EDITABLE_MESSAGE, "COMMUNITY_POST_UPDATE_FAILED");
  }
}

/**
 * 软删除：设置 deleted_at，跟 comments-repository.ts 的 softDeleteComment
 * 同一个模式，同样用 .select("id").maybeSingle() 确认真的改到了一行。
 */
export async function deleteCommunityPost(id: string, authorId: string): Promise<void> {
  const payload: TablesUpdate<"community_posts"> = {
    deleted_at: new Date().toISOString()
  };

  const { data, error } = await getSupabaseClient()
    .from("community_posts")
    .update(payload)
    .eq("id", id)
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "COMMUNITY_POST_DELETE_FAILED", error);
  }
  if (!data) {
    throw new AppError(COMMUNITY_POST_NOT_DELETABLE_MESSAGE, "COMMUNITY_POST_DELETE_FAILED");
  }
}
