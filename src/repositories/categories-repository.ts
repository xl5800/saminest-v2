import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "../types/database.generated";
import { AppError } from "../utils/app-error";

// Postgres/PostgREST 的 unique_violation 错误码，对应 categories 表的
// categories_slug_key 唯一约束（见
// supabase/migrations/20260715220100_create_categories_table.sql）。跟
// reports-repository.ts 的 createReport 是同一种处理方式：撞上这个约束时
// 抛一个专门的、带友好文案的 AppError，而不是把原始数据库错误抛给调用方。
const UNIQUE_VIOLATION_CODE = "23505";
const SLUG_DUPLICATE_MESSAGE = "该 slug 已被使用，请换一个。";

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

export interface AdminCategoryListItem {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * 管理员分类管理列表（/admin/categories）用。跟公开的 listActiveCategories
 * 不同，这里不加 `.eq("is_active", true)` 过滤——categories_select_active_or_admin
 * 这条 RLS 策略本身就会给管理员放行未启用的分类（`is_active = true or
 * is_admin()`），管理员需要在这个页面里看到并能重新启用已停用的分类。
 * 按 sort_order 升序排列，因为分类有产品定义的展示顺序，不是按创建时间的
 * 处理队列。
 */
export async function listAllCategoriesForAdmin(): Promise<
  AdminCategoryListItem[]
> {
  const { data, error } = await getSupabaseClient()
    .from("categories")
    .select("id, slug, name_zh, name_en, description, sort_order, is_active")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError(error.message, "ADMIN_CATEGORIES_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active
  }));
}

export interface CreateCategoryInput {
  slug: string;
  nameZh: string;
  nameEn: string | null;
  description: string | null;
  sortOrder: number;
}

export interface CreateCategoryResult {
  id: string;
}

/**
 * 新建分类（categories_insert_admin_only 这条 RLS 策略要求调用方是管理员）。
 * 撞上 categories_slug_key 唯一约束时（23505）抛出一个专门的
 * CATEGORY_SLUG_DUPLICATE AppError，跟 createReport 处理 REPORT_DUPLICATE
 * 是同一套技巧。
 */
export async function createCategory(
  input: CreateCategoryInput
): Promise<CreateCategoryResult> {
  const payload: TablesInsert<"categories"> = {
    slug: input.slug,
    name_zh: input.nameZh,
    name_en: input.nameEn,
    description: input.description,
    sort_order: input.sortOrder
  };

  const { data, error } = await getSupabaseClient()
    .from("categories")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new AppError(
        SLUG_DUPLICATE_MESSAGE,
        "CATEGORY_SLUG_DUPLICATE",
        error
      );
    }
    throw new AppError(error.message, "CATEGORY_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError(
      "创建分类后无法读取分类 ID。",
      "CATEGORY_CREATE_ID_MISSING"
    );
  }

  return { id: data.id };
}

export interface UpdateCategoryInput {
  slug?: string;
  nameZh?: string;
  nameEn?: string | null;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * 更新分类（categories_update_admin_only 这条 RLS 策略要求调用方是管理员）。
 * 这一个函数同时承担"编辑字段"和"启用/停用切换"两种用途——两者底层都只是
 * 对同一行 categories 做一次 UPDATE，没有必要为了"切换启用状态"单独包一个
 * 函数。同样捕获 23505：把一个分类的 slug 改成跟另一个已有分类重复时会撞
 * 上同一个唯一约束，映射成跟 createCategory 一致的 CATEGORY_SLUG_DUPLICATE。
 */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput
): Promise<void> {
  const payload: TablesUpdate<"categories"> = {};
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.nameZh !== undefined) payload.name_zh = input.nameZh;
  if (input.nameEn !== undefined) payload.name_en = input.nameEn;
  if (input.description !== undefined) payload.description = input.description;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  const { error } = await getSupabaseClient()
    .from("categories")
    .update(payload)
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new AppError(
        SLUG_DUPLICATE_MESSAGE,
        "CATEGORY_SLUG_DUPLICATE",
        error
      );
    }
    throw new AppError(error.message, "CATEGORY_UPDATE_FAILED", error);
  }
}
