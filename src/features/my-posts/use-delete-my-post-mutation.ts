import { useMutation } from "@tanstack/react-query";

import { deleteMyPost } from "../../repositories/posts-repository";

/**
 * 作者自己删除自己的帖子。不 invalidateQueries——同
 * use-delete-post-mutation.ts（管理员版本）的模式，my-posts-page.tsx 在
 * mutateAsync 成功后自己把这一行从本地列表里移除。
 */
export function useDeleteMyPostMutation() {
  return useMutation({
    mutationFn: (postId: string) => deleteMyPost(postId)
  });
}
