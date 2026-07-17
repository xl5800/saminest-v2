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
