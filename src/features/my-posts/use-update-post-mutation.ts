import { useMutation } from "@tanstack/react-query";

import { type UpdatePostInput, updatePost } from "../../repositories/posts-repository";

/**
 * 编辑表单提交用。不 invalidateQueries my-posts 列表——理由跟
 * use-approve-post-mutation.ts 一致：调用方（编辑表单）成功后直接
 * navigate 回 /my-posts，那个页面的查询本来就会在挂载时重新拉取一次
 * 最新数据，不需要在这里额外触发一次失效。
 */
export function useUpdatePostMutation() {
  return useMutation({
    mutationFn: (input: UpdatePostInput) => updatePost(input)
  });
}
