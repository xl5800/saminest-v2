import { useQuery } from "@tanstack/react-query";

import { getPostAuthorId } from "../../repositories/posts-repository";

// 帖子作者不会变化（没有任何地方允许修改 posts.author_id），staleTime
// 设长一些，跟 use-categories-query.ts 的做法一致（见 Architecture.md 6.6）。
const POST_AUTHOR_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * 只查某个帖子的 author_id，供 ContactSellerButton 判断"当前登录用户是不是
 * 这个帖子的发布者"。
 */
export function usePostAuthorQuery(postId: string) {
  return useQuery<string | null>({
    queryKey: ["post-author", postId],
    queryFn: () => getPostAuthorId(postId),
    staleTime: POST_AUTHOR_STALE_TIME_MS
  });
}
