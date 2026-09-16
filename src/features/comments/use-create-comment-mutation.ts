import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createComment,
  type CreateCommentInput
} from "../../repositories/comments-repository";

/**
 * 发表评论/回复（parentId 是 null 还是某条评论的 id，由调用方决定，这个
 * mutation 不区分"顶层评论"和"回复"，两者是同一个 insert）。同时服务帖子
 * 评论区和活动留言区（找搭子留言区任务卡泛化）——两边共用同一个
 * comment-item.tsx 渲染回复表单，回复时用哪个 hook 不应该取决于当前节点
 * 挂在帖子还是活动下面，所以这里没有拆成 useCreateCommentMutation /
 * useCreateActivityCommentMutation 两个平行 hook（对照 favorites-repository.ts
 * 那种"帖子/活动各一套独立类型+函数"的模式，这里选了泛化单一 hook 的
 * 方案——理由见 comments-repository.ts 里 CommentTarget 的注释：分叉出两个
 * hook 只会把"这个回复到底该调哪个 mutation"的判断转嫁给
 * comment-item.tsx，用一个 target 参数把判断收在这一层反而更简单）。
 *
 * 成功后按 variables 里到底是 postId 还是 activityId，invalidate 对应的
 * 两个 queryKey：
 * - postId 分支：["post-comments", postId] + ["post-detail", postId]，
 *   跟改动前逐字一致，帖子这条路径的行为/queryKey/失效时机完全没变。
 * - activityId 分支：["activity-comments", activityId] +
 *   ["activity-detail", activityId]——activities.comment_count 由数据库
 *   触发器同步更新，跟 posts.comment_count 是同一个模式，见
 *   activities-repository.ts 里 getActivityDetail 的注释。
 */
export function useCreateCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCommentInput) => createComment(input),
    onSuccess: (_data, variables) => {
      if ("postId" in variables) {
        void queryClient.invalidateQueries({
          queryKey: ["post-comments", variables.postId]
        });
        void queryClient.invalidateQueries({
          queryKey: ["post-detail", variables.postId]
        });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["activity-comments", variables.activityId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["activity-detail", variables.activityId]
      });
    }
  });
}
