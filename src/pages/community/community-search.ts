import type { Community } from "../../repositories/community-repository";

/**
 * 社区搜索（社区浏览页"发现"Tab、全站搜索页共用）：社区数量很少，直接在
 * listCommunities() 的结果上按名称/简介/slug 做不区分大小写的包含匹配，不额外
 * 发请求。关键词为空返回空数组。
 */
export function filterCommunitiesByKeyword(communities: Community[], keyword: string): Community[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return [];
  return communities.filter(
    (community) =>
      community.name.toLowerCase().includes(normalized) ||
      (community.description ?? "").toLowerCase().includes(normalized) ||
      community.slug.toLowerCase().includes(normalized)
  );
}
