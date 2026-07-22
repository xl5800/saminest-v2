import { useQuery } from "@tanstack/react-query";

import { getPostDetail, type PostDetail } from "../../repositories/posts-repository";

export interface UsePostDetailQueryOptions {
  // 编辑帖子页面（publish-page.tsx）复用这同一个 hook 回填表单，但只有在
  // 编辑模式（路由带 :id）才需要真的发请求——新建模式下 postId 是空字符
  // 串，不能让 useQuery 拿一个空 id 去查。Hooks 不能条件调用，所以用
  // `enabled` 让调用方控制"要不要真的发这次查询"，而不是在调用点外面
  // 包一层 if。默认 true，跟这个 hook 原来（帖子详情页，postId 必然存在）
  // 的行为完全不变。
  enabled?: boolean;
}

/**
 * 帖子详情页 / 编辑帖子页面（publish-page.tsx 的编辑模式）共用：直接把
 * getPostDetail 包一层 useQuery，不在这里加任何额外的数据变换——
 * 字段映射/可见性判断都已经在 repository 层做完了。两个页面都需要
 * "按 id 查一条 posts 完整字段 + categoryId/locationId/locationText/
 * status 这些编辑表单回填用的原始值"，是同一个查询，没必要分别封装
 * 两个几乎一样的 hook。
 *
 * data 为 null 表示帖子不存在，或者当前登录身份看不到它（被 RLS 过滤
 * 掉）——这两种情况在这一层也不做区分，页面统一渲染"帖子未找到"（详情页）
 * 或"没有权限编辑"（编辑页），不额外判断、不泄露信息。
 */
export function usePostDetailQuery(
  postId: string,
  options: UsePostDetailQueryOptions = {}
) {
  const { enabled = true } = options;
  return useQuery<PostDetail | null>({
    queryKey: ["post-detail", postId],
    queryFn: () => getPostDetail(postId),
    enabled
  });
}
