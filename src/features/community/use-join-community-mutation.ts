import { useMutation } from "@tanstack/react-query";

import { joinCommunity } from "../../repositories/community-repository";

export function useJoinCommunityMutation() {
  return useMutation({
    mutationFn: joinCommunity
  });
}
