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

interface RegionContentCountRow {
  location: { state_code: string | null } | null;
}

/**
 * 08 号卡「地区选择」页"按热度"排序用：按州代码统计当前活跃内容数量
 * （活动 + 帖子合计），供 region-select-page.tsx 给全美 51 项排序。
 *
 * 没有建数据库视图/RPC 做服务端 GROUP BY——这个项目目前的内容量级（个位数
 * 到几十条，见 activities-repository.ts/posts-repository.ts 其它地方对
 * "这个体量不需要昂贵聚合"的同类判断）用两次轻量查询、在 JS 里累加就完全
 * 够用，不值得为了一个排序功能新增一张视图/一次迁移。两次查询只选
 * `locations!inner(state_code)` 这一列（不是完整的帖子/活动字段），
 * `!inner` 强制内连接——location_id 为 null（没填地区）的帖子/活动在这里
 * 天然被排除，不计入任何一个州的热度，这跟 listApprovedPosts/listActivities
 * 里"筛选某个州时，没有地区信息的内容不应该被算进那个州"是同一个判断，
 * 只是这里统计的是热度分母而不是筛选结果本身。
 *
 * 状态过滤口径分别照抄 listApprovedPosts（status = 'approved' 且未软删除）
 * 和 listActivities（status in ('open','full') 且 start_at 未过去）——"热度"
 * 应该反映"用户现在能看到的内容有多少"，跟这两个函数默认展示给访客的口径
 * 必须一致，不能用另一套统计口径导致热度排序和实际列表内容对不上。
 *
 * 返回一个 Map<州代码, 数量>——没有出现在这个 Map 里的州代码（大多数还没有
 * 任何内容的州）视为 0，调用方（sortByMode 的"按热度"分支）自己处理这个
 * 兜底，不在这里把全部 51 个州都预先垫上 0（那些州代码来自
 * src/data/us-states.ts 这份静态数据，不是这个函数的职责）。
 */
export async function listRegionContentCounts(): Promise<Map<string, number>> {
  const nowIso = new Date().toISOString();

  const [postsResult, activitiesResult] = await Promise.all([
    getSupabaseClient()
      .from("posts")
      .select("location:locations!inner(state_code)")
      .eq("status", "approved")
      .is("deleted_at", null)
      .overrideTypes<RegionContentCountRow[]>(),
    getSupabaseClient()
      .from("activities")
      .select("location:locations!inner(state_code)")
      .in("status", ["open", "full"])
      .gte("start_at", nowIso)
      .overrideTypes<RegionContentCountRow[]>()
  ]);

  if (postsResult.error) {
    throw new AppError(postsResult.error.message, "REGION_CONTENT_COUNTS_POSTS_FAILED", postsResult.error);
  }
  if (activitiesResult.error) {
    throw new AppError(
      activitiesResult.error.message,
      "REGION_CONTENT_COUNTS_ACTIVITIES_FAILED",
      activitiesResult.error
    );
  }

  const counts = new Map<string, number>();
  function tally(rows: RegionContentCountRow[]): void {
    for (const row of rows) {
      const stateCode = row.location?.state_code;
      if (!stateCode) continue;
      counts.set(stateCode, (counts.get(stateCode) ?? 0) + 1);
    }
  }
  tally(postsResult.data ?? []);
  tally(activitiesResult.data ?? []);

  return counts;
}
