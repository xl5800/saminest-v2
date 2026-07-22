import { useMutation } from "@tanstack/react-query";

import { removeOwnPostImage } from "../../repositories/post-images-repository";

/**
 * 编辑帖子页面用：作者删除自己已经上传的一张图片。跟
 * use-delete-my-post-mutation.ts 同一个模式——不 invalidateQueries，
 * publish-page.tsx 在 mutateAsync 成功后自己把这张图片从本地的
 * existingImages 列表里移除，不需要靠查询失效重新拉一次帖子详情。
 */
export function useRemovePostImageMutation() {
  return useMutation({
    mutationFn: (imageId: string) => removeOwnPostImage(imageId)
  });
}
