import { useMutation } from "@tanstack/react-query";

import { resubmitPost } from "../../repositories/posts-repository";

/**
 * 重新提交审核。不 invalidateQueries——同 use-archive-post-mutation.ts，
 * my-posts-page.tsx 在 mutateAsync 成功后自己把这一行的状态更新成
 * 'pending'、清空本地的 rejectionReason 展示，不依赖重新 fetch。
 */
export function useResubmitPostMutation() {
  return useMutation({
    mutationFn: (postId: string) => resubmitPost(postId)
  });
}
