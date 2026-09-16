import { useQuery } from "@tanstack/react-query";

import { listComments, type Comment } from "../../repositories/comments-repository";

/**
 * 活动详情页留言区用（找搭子留言区任务卡）：一次性拉出这个活动下的全部
 * 留言（含已软删除的），组件层自己用 build-comment-tree.ts 拼成树——跟
 * usePostCommentsQuery(postId) 是完全对称的写法，唯一区别是查询目标换成
 * { activityId }、queryKey 前缀换成 "activity-comments"（避免跟帖子那边的
 * "post-comments" 撞 key）。这一轮同样不做 Realtime、不做分页，只在挂载
 * 时查一次，提交/删除留言后由对应 mutation invalidate 这个 queryKey 触发
 * 重新拉取。
 */
export function useActivityCommentsQuery(activityId: string) {
  return useQuery<Comment[]>({
    queryKey: ["activity-comments", activityId],
    queryFn: () => listComments({ activityId })
  });
}
