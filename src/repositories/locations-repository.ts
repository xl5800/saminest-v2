import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

export interface LocationListItem {
  id: string;
  name: string;
}

/**
 * 发布表单里的地区下拉框用这个查询，只返回启用中的地区，
 * 结构和 categories-repository.ts 的 listActiveCategories 一致。
 */
export async function listActiveLocations(): Promise<LocationListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("locations")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError(error.message, "LOCATIONS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name
  }));
}
