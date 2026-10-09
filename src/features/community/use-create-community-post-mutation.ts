import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createCommunityPost } from "../../repositories/community-repository";

export function useCreateCommunityPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCommunityPost,
    // 首页的聚合 Feed（已加入的几个社区 / 全部社区）和单个社区 Feed 的缓存 key 都
    // 以 ["community-posts"] 开头，新帖子要让它们全部失效，不能只失效发帖所在
    // 社区那一份。
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
    }
  });
}
