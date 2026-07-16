import { getSupabaseClient } from "../integrations/supabase/client";
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
