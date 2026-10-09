import { useMutation, useQueryClient } from "@tanstack/react-query";

import { joinCommunity } from "../../repositories/community-repository";
import { COMMUNITY_MEMBERSHIP_QUERY_KEY } from "./use-community-membership-query";
import { MY_COMMUNITIES_QUERY_KEY } from "./use-my-communities-query";

export function useJoinCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: joinCommunity,
    // 加入社区会同时改变好几份缓存：
    // - ["community"]：社区头部展示的成员数（communities.member_count）由触发器
    //   在新成员加入时加一，而社区查询 staleTime 是 Infinity，不失效的话刚加入的
    //   用户看到的还是加入前的数字；
    // - 成员状态（社区浏览页卡片的"加入/已加入"）和"我的社区"列表（首页要据此从
    //   "全部社区兜底"切到个性化、发帖页下拉框的选项）；
    // - ["community-posts"]：首页按已加入社区聚合，加入后范围变了。
    // 重复加入（23505 被当成功吞掉）也会走到这里，多一次轻量重新拉取，没有副作用。
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community"] });
      void queryClient.invalidateQueries({ queryKey: [COMMUNITY_MEMBERSHIP_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [MY_COMMUNITIES_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
    }
  });
}
