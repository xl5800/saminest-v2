import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteCommunityPost } from "../../repositories/community-repository";

export function useDeleteCommunityPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, authorId }: { id: string; authorId: string }) =>
      deleteCommunityPost(id, authorId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["my-community-posts", variables.authorId] });
      // 软删除后 Feed 要立刻把这条帖子挡掉。
      void queryClient.invalidateQueries({ queryKey: ["community-posts"] });
    }
  });
}
