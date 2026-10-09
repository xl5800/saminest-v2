import { useQuery } from "@tanstack/react-query";

import { isCommunityMember } from "../../repositories/community-repository";

export const COMMUNITY_MEMBERSHIP_QUERY_KEY = "community-membership";

/**
 * 当前用户是不是某个社区的成员（社区浏览页的"加入/已加入"按钮、"我的
 * 社区"Tab 用）。communityId / userId 任何一个还没有（社区还在加载、或者
 * 游客没登录）时查询被 enabled 挡住——游客本来就不可能是成员，调用方把
 * "没登录"直接当"未加入"处理，不需要发一次必然拿不到行的请求。
 *
 * staleTime 显式设成 0，不用全局默认的 30 秒：Feed 页（/community/dmv）
 * 会在后台静默加入（见 community-feed-page.tsx），用户从 Feed 返回浏览页时
 * 如果这里还吃着 30 秒内的旧缓存，卡片会继续显示"加入"，其实已经是成员了。
 * 设成 0 之后每次浏览页挂载都会重新确认一次，这是一个一行的小查询，代价
 * 可以忽略。
 */
export function useCommunityMembershipQuery(
  communityId: string | undefined,
  userId: string | undefined
) {
  return useQuery({
    queryKey: [COMMUNITY_MEMBERSHIP_QUERY_KEY, communityId, userId],
    queryFn: () => isCommunityMember(communityId as string, userId as string),
    enabled: Boolean(communityId && userId),
    staleTime: 0
  });
}
