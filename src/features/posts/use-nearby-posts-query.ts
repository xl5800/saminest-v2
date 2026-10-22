import { useInfiniteQuery } from "@tanstack/react-query";

import { listNearbyPostIds } from "../../repositories/nearby-repository";
import { listApprovedPostsByIds, type PostFeedItem } from "../../repositories/posts-repository";

export const NEARBY_PAGE_SIZE = 20;

export interface NearbyPostItem {
  post: PostFeedItem;
  distanceMiles: number | null;
}

/**
 * 首页"附近的二手"任务卡：按距离一页一页往下取。每页先用 list_nearby_posts
 * 拿到按距离排好的 id，再用现有的列表查询按 id 取帖子内容。queryKey 以
 * "posts" 开头，发帖 / 编辑后现有的 invalidateQueries(["posts"]) 会顺带刷新它。
 */
export function useNearbyPostsInfiniteQuery(input: {
  latitude: number;
  longitude: number;
  categorySlugs: string[];
  /** 房屋页：范围内按发布时间从新到旧（见 listNearbyPostIds）。不传按距离排。 */
  radiusMiles?: number;
  searchQuery?: string;
}) {
  const { latitude, longitude, categorySlugs, radiusMiles } = input;
  const searchQuery = input.searchQuery?.trim() || undefined;

  return useInfiniteQuery({
    queryKey: ["posts", "nearby", { latitude, longitude, categorySlugs, radiusMiles, searchQuery }],
    queryFn: async ({ pageParam }) => {
      const refs = await listNearbyPostIds({
        latitude,
        longitude,
        categorySlugs,
        limit: NEARBY_PAGE_SIZE,
        offset: pageParam,
        ...(radiusMiles !== undefined ? { radiusMiles } : {}),
        ...(searchQuery ? { searchQuery } : {})
      });
      const posts = await listApprovedPostsByIds(refs.map((ref) => ref.postId));
      const postById = new Map(posts.map((post) => [post.id, post]));
      const items: NearbyPostItem[] = refs.flatMap((ref) => {
        const post = postById.get(ref.postId);
        return post ? [{ post, distanceMiles: ref.distanceMiles }] : [];
      });
      return { items, fetchedCount: refs.length };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastOffset) =>
      lastPage.fetchedCount === NEARBY_PAGE_SIZE ? lastOffset + NEARBY_PAGE_SIZE : undefined
  });
}
