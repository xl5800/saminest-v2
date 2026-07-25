import { useMutation, useQueryClient } from "@tanstack/react-query";

import { removeOwnPostImage } from "../../repositories/post-images-repository";

/**
 * 编辑帖子页面用：作者删除自己已经上传的一张图片。
 *
 * 帖子详情本身不需要 invalidateQueries——publish-page.tsx 在
 * mutateAsync 成功后自己把这张图片从本地的 existingImages 列表里移除，
 * 不需要靠查询失效重新拉一次帖子详情，这一点跟 use-delete-my-post-
 * mutation.ts 是同一个模式。
 *
 * 但这张图片有没有被删，直接影响"这个帖子的封面图是哪一张"，而封面图会
 * 出现在首页/分类页/搜索（都是 usePostsQuery，queryKey 前缀 "posts"）和
 * "我的发布"（["my-posts", userId]）里——这几个列表页各自维护自己的
 * TanStack Query 缓存，删图片这个动作本身不会让它们知道要重新拉数据，
 * 不显式 invalidate 的话，用户删完图片回到首页，看到的还是删除前缓存住的
 * 封面图，直到缓存自然过期或者手动刷新页面。收藏列表（["favorited-posts",
 * userId]）目前不展示封面图，失效它不会有可见效果，但作用域跟另外两个
 * 一样是"这个帖子的公开展示信息变了"，一起处理，不留一个不一致的例外。
 */
export function useRemovePostImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageId: string) => removeOwnPostImage(imageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      void queryClient.invalidateQueries({ queryKey: ["my-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["favorited-posts"] });
    }
  });
}
