import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

export interface LocationListItem {
  id: string;
  name: string;
}

/**
 * 发布表单里的地区下拉框用这个查询，只返回启用中的、type = 'city' 的地区，
 * 结构和 categories-repository.ts 的 listActiveCategories 一致。
 *
 * 显式加 type = 'city' 过滤（以前没有，因为 locations 表以前只有一种
 * type）：现在表里还混着 3 条 type = 'state' 的行（listActiveActivityRegions
 * 专用，见下），不过滤的话这 3 条会混进发帖的城市下拉框里。
 */
export async function listActiveLocations(): Promise<LocationListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("locations")
    .select("id, name")
    .eq("is_active", true)
    .eq("type", "city")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError(error.message, "LOCATIONS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name
  }));
}

export interface LocationWithStateItem {
  id: string;
  name: string;
  /** 城市所属的州，即 locations.state_code（'DC' / 'VA' / 'MD'）——跟
   *  listActiveActivityRegions() 返回的 3 条 type = 'state' 行的 name
   *  字段是同一套取值，06 号卡地区选择页用这个字段把城市分组挂到对应的
   *  州名下面，不需要额外的州-城市关联表。理论上这一列是 nullable（表定义
   *  允许 null），但种子数据里 14 条 type = 'city' 行全部填了这一列，这里
   *  仍按 nullable 建模，不假设数据库层面一定非空。 */
  stateCode: string | null;
}

/**
 * 06 号卡「地区选择」页专用：跟 listActiveLocations 查同一张表、同样的
 * is_active/type='city' 过滤和排序，只是多选一列 state_code——地区选择页
 * 需要按州把城市分组（州内只有一个城市的直接可选中，多个城市的带下钻
 * 箭头，见 region-select-page.tsx），listActiveLocations 现有调用方
 * （发布表单的城市下拉框）不需要这一列，不改它的返回结构，新增这个函数
 * 而不是给 LocationListItem 加字段，避免所有现有调用方都要跟着改。
 */
export async function listActiveCitiesWithState(): Promise<LocationWithStateItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("locations")
    .select("id, name, state_code")
    .eq("is_active", true)
    .eq("type", "city")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError(error.message, "LOCATIONS_WITH_STATE_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    stateCode: row.state_code
  }));
}

/**
 * 找搭子（活动）的地区筛选 + 发起活动地区选择用。跟 listActiveLocations
 * 查同一张 locations 表，但只取 type = 'state' 的 3 条（DC/VA/MD）——
 * 找搭子不再选具体城市，具体城市由发起人自己写进活动标题，这里只提供一个
 * 粗粒度的"州"筛选，见 docs/01_Product/FindBuddy-Design.md 里"按州分组"
 * 那段的取舍说明（DMV 横跨三个州，按州筛虽然不代表真实距离，但对 DMV
 * 本地人来说 DC/NOVA/MD 本来就是日常会用的粗略分法，牺牲精度换发布门槛）。
 *
 * 返回类型复用 LocationListItem（{id, name}），跟 listActiveLocations 结构
 * 完全一样，没必要为了这三条数据单独定义一个新类型。
 */
export async function listActiveActivityRegions(): Promise<LocationListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("locations")
    .select("id, name")
    .eq("is_active", true)
    .eq("type", "state")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError(error.message, "ACTIVITY_REGIONS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name
  }));
}
