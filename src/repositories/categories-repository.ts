import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

export interface CategoryListItem {
  id: string;
  slug: string;
  nameZh: string;
}

export async function listActiveCategories(): Promise<CategoryListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("categories")
    .select("id, slug, name_zh")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError(error.message, "CATEGORIES_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    nameZh: row.name_zh
  }));
}
