import { useQuery } from "@tanstack/react-query";

import { listPostComments, type Comment } from "../../repositories/comments-repository";

/**
 * 帖子详情页评论区用：一次性拉出这个帖子下的全部评论（含已软删除的），
 * 组件层自己用 build-comment-tree.ts 拼成树。这一轮不做 Realtime，不在
 * 挂载期间轮询——评论列表只在进入详情页时查一次，用户自己提交/删除评论
 * 后由对应的 mutation invalidate 这个 queryKey 触发重新拉取。
 */
export function usePostCommentsQuery(postId: string) {
  return useQuery<Comment[]>({
    queryKey: ["post-comments", postId],
    queryFn: () => listPostComments(postId)
  });
}
