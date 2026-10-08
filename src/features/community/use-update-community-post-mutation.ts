import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateCommunityPost } from "../../repositories/community-repository";

export function useUpdateCommunityPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCommunityPost,
    onSuccess: (_result, variables) => {
      // 编辑完回到详情页/列表页都要看到最新内容；Feed 里的卡片也显示标题/
      // 摘要/类型，一并失效。
      void queryClient.invalidateQueries({ queryKey: ["community-post-detail", variables.id] });
      void queryClient.invalidateQueries({ queryKey: ["my-community-posts", variables.authorId] });
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
    }
  });
}
