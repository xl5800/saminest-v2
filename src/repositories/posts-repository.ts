import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

export interface PostListItem {
  id: string;
  title: string;
  priceAmount: number | null;
  priceLabel: string | null;
  currencyCode: string;
  locationName: string | null;
  publishedAt: string | null;
}

export interface ListApprovedPostsInput {
  categoryId?: string;
  page: number;
  pageSize: number;
}

export interface ListApprovedPostsResult {
  posts: PostListItem[];
  hasNextPage: boolean;
}

interface PostListRow {
  id: string;
  title: string;
  price_amount: number | null;
  price_label: string | null;
  currency_code: string;
  published_at: string | null;
  location: { name: string } | null;
}

/**
 * 只返回 status = 'approved' 且未软删除的帖子，游客和登录用户看到的列表一致。
 * 用多取一条（pageSize + 1）判断是否有下一页，不额外发 COUNT(*) 查询，
 * 见 Tables.md 24 节"不要为了每次展示数量都执行昂贵的全表统计"。
 */
export async function listApprovedPosts(
  input: ListApprovedPostsInput
): Promise<ListApprovedPostsResult> {
  const { categoryId, page, pageSize } = input;
  const from = page * pageSize;
  const to = from + pageSize;

  let query = getSupabaseClient()
    .from("posts")
    .select(
      "id, title, price_amount, price_label, currency_code, published_at, location:locations(name)"
    )
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .range(from, to);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query.overrideTypes<PostListRow[]>();

  if (error) {
    throw new AppError(error.message, "POSTS_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const hasNextPage = rows.length > pageSize;
  const pageRows = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    posts: pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      priceAmount: row.price_amount,
      priceLabel: row.price_label,
      currencyCode: row.currency_code,
      locationName: row.location?.name ?? null,
      publishedAt: row.published_at
    })),
    hasNextPage
  };
}

/**
 * 只取某个帖子的 author_id，供 ContactSellerButton 判断"当前登录用户是不是
 * 这个帖子的发布者"用——不是完整的帖子详情查询（那是以后单独的任务），
 * 只选这一列。帖子不存在（或已被删除到查不到）时返回 null，不当成错误抛出，
 * 只有真正的 Supabase 查询失败才包装成 AppError。
 */
export async function getPostAuthorId(postId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "POST_AUTHOR_FETCH_FAILED", error);
  }

  return data?.author_id ?? null;
}

export interface AdminPostListItem {
  id: string;
  title: string;
  createdAt: string;
  authorName: string;
  categoryName: string;
  status: string;
}

interface AdminPendingPostRow {
  id: string;
  title: string;
  created_at: string;
  author: { display_name: string } | null;
  category: { name_zh: string } | null;
}

/**
 * 管理员审核队列用：所有 status = 'pending' 且未软删除的帖子，按 created_at
 * 升序排列——审核队列按"等得最久的先处理"排序是有意的选择，不是随手写反了
 * listApprovedPosts 的 descending。
 *
 * 跟公开列表/消息 UI 里刻意不暴露发帖人真实身份（保护普通用户之间的隐私）
 * 不同，这是内部管理后台，管理员审核内容必须知道是谁发的、发在哪个分类下，
 * 一个 UUID 对审核工作没有意义，所以这里用嵌套 select 把 profiles.display_name
 * 和 categories.name_zh 一起带出来（写法跟 listApprovedPosts 的
 * location:locations(name) 一致）。理论上 author_id/category_id 都有外键
 * 约束，关联的 profiles/categories 行不应该缺失，但嵌套 join 万一返回 null
 * 时这里退回一个占位文案，不让页面崩掉。
 */
export async function listPendingPosts(): Promise<AdminPostListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("posts")
    .select(
      "id, title, created_at, author:profiles(display_name), category:categories(name_zh)"
    )
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .overrideTypes<AdminPendingPostRow[]>();

  if (error) {
    throw new AppError(error.message, "ADMIN_PENDING_POSTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    authorName: row.author?.display_name ?? "未知用户",
    categoryName: row.category?.name_zh ?? "未知分类",
    // 这个查询本身已经用 .eq("status", "pending") 过滤过了，字面量比多选一列
    // status 再从 row 上读一遍更直接；AdminPostListItem 加这个字段主要是为了
    // 给 listAllPosts（混合状态的列表）用，listPendingPosts 这边永远是
    // "pending"，没必要为了这一个已知常量再多查一列。
    status: "pending"
  }));
}

export interface CreatePostInput {
  authorId: string;
  categoryId: string;
  locationId: string | null;
  title: string;
  description: string;
  priceAmount: number | null;
  contactMethod: string | null;
  contactValue: string | null;
}

export interface CreatePostResult {
  id: string;
}

/**
 * 发布表单提交时用这个方法创建帖子。`status` 在这里硬编码为 'pending'，
 * 不接受调用方传入，防止普通用户绕过审核直接把帖子设为 approved
 * （见 Tables.md 9.8 权限原则："不能把状态直接改为 approved"）。
 */
export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  const payload: TablesInsert<"posts"> = {
    author_id: input.authorId,
    category_id: input.categoryId,
    location_id: input.locationId,
    title: input.title,
    description: input.description,
    price_amount: input.priceAmount,
    contact_method: input.contactMethod,
    contact_value: input.contactValue,
    status: "pending"
  };

  const { data, error } = await getSupabaseClient()
    .from("posts")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw new AppError(error.message, "POST_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("创建帖子后无法读取帖子 ID。", "POST_CREATE_ID_MISSING");
  }

  return { id: data.id };
}

interface AdminAllPostRow {
  id: string;
  title: string;
  created_at: string;
  status: string;
  author: { display_name: string } | null;
  category: { name_zh: string } | null;
}

/**
 * 管理员"全部帖子"管理列表（/admin/posts/all）用：默认返回所有未软删除的
 * 帖子，不限制 status（draft/pending/approved/rejected/archived 都在内），
 * 可选传 statusFilter 再收窄到某一个状态。
 *
 * 按 created_at 降序排列（最新的在前面）——这是刻意跟 listPendingPosts
 * （created_at 升序、"等得最久的先处理"）不同的排序，不是抄错了写反：这里
 * 是一个通用的浏览/管理列表，不是要按顺序处理完就清空的审核队列，管理员
 * 大概率更关心"最近发生了什么"，所以默认最新的在最前面，跟 listApprovedPosts
 * 面向访客的公开列表排序方向一致。
 *
 * 嵌套 select 复用 listPendingPosts 那一套（author:profiles(display_name)、
 * category:categories(name_zh)）：posts 对 profiles 只有 author_id 这一个
 * 外键，对 categories 只有 category_id 这一个外键，跟 reports 表对 profiles
 * 有两个外键（reporter_id / reviewer_id）导致嵌套 select 必须写
 * `profiles!reports_reporter_id_fkey(...)` 消歧的情况不同，这里没有那个坑，
 * 沿用不带外键提示的写法是安全的。
 */
export async function listAllPosts(statusFilter?: string): Promise<AdminPostListItem[]> {
  let query = getSupabaseClient()
    .from("posts")
    .select(
      "id, title, created_at, status, author:profiles(display_name), category:categories(name_zh)"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query.overrideTypes<AdminAllPostRow[]>();

  if (error) {
    throw new AppError(error.message, "ADMIN_ALL_POSTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    authorName: row.author?.display_name ?? "未知用户",
    categoryName: row.category?.name_zh ?? "未知分类",
    status: row.status
  }));
}
