import { useQuery } from "@tanstack/react-query";

import { countPendingPosts } from "../../repositories/posts-repository";

/**
 * 管理后台顶部 Tab「待审核」角标用的数量查询（功能改动清单第 7 项）。跟
 * use-pending-posts-query.ts（拉整份待审核列表，给 pending-posts-page.tsx
 * 用）是两个独立的查询——queryKey 不同（这个用 ["admin", "pending-posts-count"]，
 * 不是 ["admin", "pending-posts"]），互不影响对方的缓存；批准/驳回帖子后
 * 这个角标数字靠 react-query 默认的 refetch-on-mount/refetch-on-window-focus
 * 自然刷新，不需要每个批准/驳回的 mutation 都手动去更新这份缓存——角标本身
 * 允许有一点点滞后，不是这几个 mutation 的核心成功路径。
 */
export function usePendingPostsCountQuery() {
  return useQuery<number>({
    queryKey: ["admin", "pending-posts-count"],
    queryFn: countPendingPosts
  });
}
