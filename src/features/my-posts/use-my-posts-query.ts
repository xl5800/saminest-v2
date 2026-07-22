import { useQuery } from "@tanstack/react-query";

import { type MyPostListItem, listMyPosts } from "../../repositories/posts-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * "我的发布"管理页（/my-posts）用：当前登录用户自己的全部帖子，不限状态。
 * 没有登录用户时禁用查询——这个 hook 只会在 /my-posts 页面使用，该路由
 * 已经被 RequireAuth 包裹，这里的 enabled 只是防御性的，不承担鉴权职责
 * （跟 use-my-profile-query.ts 是同一个模式）。
 */
export function useMyPostsQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<MyPostListItem[]>({
    queryKey: ["my-posts", userId],
    queryFn: () => listMyPosts(userId as string),
    enabled: !!userId
  });
}
