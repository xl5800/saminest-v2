import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createCommunityPost } from "../../repositories/community-repository";

export function useCreateCommunityPostMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCommunityPost,
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["community-posts", variables.communityId] });
    }
  });
}
