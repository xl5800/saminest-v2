import { useQuery } from "@tanstack/react-query";

import { getPostDetail, type PostDetail } from "../../repositories/posts-repository";

/**
 * 帖子详情页用：跟 use-post-author-query.ts 是同一个薄封装模式，直接把
 * getPostDetail 包一层 useQuery，不在这里加任何额外的数据变换——
 * 字段映射/可见性判断都已经在 repository 层做完了。
 *
 * data 为 null 表示帖子不存在，或者当前登录身份看不到它（被 RLS 过滤
 * 掉）——这两种情况在这一层也不做区分，页面统一渲染"帖子未找到"，
 * 不额外判断、不泄露信息。
 */
export function usePostDetailQuery(postId: string) {
  return useQuery<PostDetail | null>({
    queryKey: ["post-detail", postId],
    queryFn: () => getPostDetail(postId)
  });
}
