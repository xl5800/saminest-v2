import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

import { type JoinCommunityInput, joinCommunity } from "../../repositories/community-repository";
import { COMMUNITY_MEMBERSHIP_QUERY_KEY } from "./use-community-membership-query";
import { MY_COMMUNITIES_QUERY_KEY } from "./use-my-communities-query";

/**
 * 加入/退出社区成功后共用的缓存处理：
 * - 先把这个社区的成员状态直接写成最新值（加入 = true，退出 = false），按钮立刻
 *   切换成"退出"/"加入"，不用等重新拉取回来；
 * - ["community"] / ["communities"]：成员数（communities.member_count）由触发器
 *   维护，社区查询缓存时间长，不失效的话看到的还是旧数字；
 * - 成员状态和"我的社区"列表（首页个性化 Feed、发帖页下拉框、浏览页"我的社区"Tab）；
 * - ["community-posts"]：首页按已加入社区聚合，加入/退出后范围变了。
 */
export function applyCommunityMembershipChange(
  queryClient: QueryClient,
  input: JoinCommunityInput,
  isMember: boolean
): void {
  queryClient.setQueryData(
    [COMMUNITY_MEMBERSHIP_QUERY_KEY, input.communityId, input.userId],
    isMember
  );
  void queryClient.invalidateQueries({ queryKey: ["community"] });
  void queryClient.invalidateQueries({ queryKey: ["communities"] });
  void queryClient.invalidateQueries({ queryKey: [COMMUNITY_MEMBERSHIP_QUERY_KEY] });
  void queryClient.invalidateQueries({ queryKey: [MY_COMMUNITIES_QUERY_KEY] });
  void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
}

export function useJoinCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: joinCommunity,
    // 重复加入（23505 被当成功吞掉）也会走到这里，多一次轻量重新拉取，没有副作用。
    onSuccess: (_data, input) => {
      applyCommunityMembershipChange(queryClient, input, true);
    }
  });
}
