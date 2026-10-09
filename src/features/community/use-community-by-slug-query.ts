import { useQuery } from "@tanstack/react-query";

import { getCommunityBySlug } from "../../repositories/community-repository";

/**
 * 按 slug 查社区（dmv / dmv-pets / dmv-students ……），社区 Feed 页从路由参数
 * 读 slug，帖子详情页用帖子自己的 communitySlug。slug 还没有时（路由参数缺失、
 * 详情还在加载）查询被 enabled 挡住。
 *
 * staleTime 设成 Infinity 不重复请求——社区这一行几乎不会变；唯一会变的成员
 * 数由加入社区的 mutation 主动 invalidate ["community"]（见
 * use-join-community-mutation.ts）。
 */
export function useCommunityBySlugQuery(slug: string | undefined) {
  return useQuery({
    queryKey: ["community", slug],
    queryFn: () => getCommunityBySlug(slug as string),
    enabled: Boolean(slug),
    staleTime: Infinity
  });
}
