import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";
import type { ZipCodeLocation } from "./zip-codes-repository";

/**
 * 首页"附近的二手"任务卡：两个数据库函数（见
 * supabase/migrations/20261019090000_add_nearby_posts_query.sql）。
 * 用户的经纬度只作为查询参数传过去，服务器不保存。
 */

export interface NearbyPostRef {
  postId: string;
  /** 到帖子邮编中心点的距离（英里）；帖子没填邮编时为 null（排在最后）。 */
  distanceMiles: number | null;
}

export interface ListNearbyPostIdsInput {
  latitude: number;
  longitude: number;
  categorySlugs: string[];
  limit: number;
  offset: number;
  /** 房屋页距离筛选：传了就"范围内按发布时间从新到旧、范围外按距离、没邮编的
   *  最后"（20261022180000_nearby_posts_radius_and_search.sql）；不传按距离排。 */
  radiusMiles?: number;
  /** 标题 / 描述包含这段文字。 */
  searchQuery?: string;
}

/** 按距离取帖子 id（不截断范围，见 migration 顶部说明）。 */
export async function listNearbyPostIds(input: ListNearbyPostIdsInput): Promise<NearbyPostRef[]> {
  const { data, error } = await getSupabaseClient().rpc("list_nearby_posts", {
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_category_slugs: input.categorySlugs,
    p_limit: input.limit,
    p_offset: input.offset,
    ...(input.radiusMiles !== undefined ? { p_radius_miles: input.radiusMiles } : {}),
    ...(input.searchQuery?.trim() ? { p_search: input.searchQuery.trim() } : {})
  });

  if (error) {
    throw new AppError(error.message, "NEARBY_POSTS_FAILED", error);
  }

  return (data ?? []).map((row) => ({ postId: row.post_id, distanceMiles: row.distance_miles }));
}

/** 按坐标找最近的邮编和城市（定位后位置条显示"Rockville 附近"）。美国本土以外返回 null。 */
export async function findNearestZipCode(latitude: number, longitude: number): Promise<ZipCodeLocation | null> {
  const { data, error } = await getSupabaseClient().rpc("nearest_zip_code", {
    p_latitude: latitude,
    p_longitude: longitude
  });

  if (error) {
    throw new AppError(error.message, "NEAREST_ZIP_FAILED", error);
  }

  const row = data?.[0];
  return row ? { zip: row.zip, city: row.city, stateCode: row.state_code } : null;
}
