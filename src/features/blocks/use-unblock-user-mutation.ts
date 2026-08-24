import { useMutation, useQueryClient } from "@tanstack/react-query";

import { unblockUser, type UnblockUserInput } from "../../repositories/user-blocks-repository";

/**
 * 取消屏蔽一个用户。成功后让 useIsBlockingQuery 重新拉取，按钮从
 * "取消屏蔽"切回"屏蔽此人"，跟 use-block-user-mutation.ts 是同一个理由。
 */
export function useUnblockUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UnblockUserInput) => unblockUser(input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: ["is-blocking", input.blockerId, input.blockedId]
      });
    }
  });
}
