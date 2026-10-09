import { useMutation, useQueryClient } from "@tanstack/react-query";

import { joinCommunity } from "../../repositories/community-repository";

export function useJoinCommunityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: joinCommunity,
    // 社区头部展示的成员数（communities.member_count）由触发器在新成员加入时
    // 加一，而社区查询 staleTime 是 Infinity，不失效的话刚加入的用户看到的还是
    // 加入前的数字。重复加入（23505 被当成功吞掉）也会走到这里，多一次轻量
    // 重新拉取，没有副作用。
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community"] });
    }
  });
}
