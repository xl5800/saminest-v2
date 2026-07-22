import { useMutation } from "@tanstack/react-query";

import { archivePost } from "../../repositories/posts-repository";

/**
 * 下架自己的帖子。不 invalidateQueries——跟 use-approve-post-mutation.ts
 * 同一个模式，my-posts-page.tsx 在 mutateAsync 成功后自己把这一行的状态
 * 更新成 'archived'，不依赖重新 fetch 来更新 UI。
 */
export function useArchivePostMutation() {
  return useMutation({
    mutationFn: (postId: string) => archivePost(postId)
  });
}
