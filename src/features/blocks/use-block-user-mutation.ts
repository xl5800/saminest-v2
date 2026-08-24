import { useMutation, useQueryClient } from "@tanstack/react-query";

import { blockUser, type BlockUserInput } from "../../repositories/user-blocks-repository";

/**
 * 屏蔽一个用户。成功后让 useIsBlockingQuery（queryKey
 * ["is-blocking", blockerId, blockedId]）重新拉取，按钮从"屏蔽此人"切到
 * "取消屏蔽"——跟 use-request-account-deletion-mutation.ts 用
 * invalidateQueries 而不是本地 setQueryData 是同一个理由：权威的屏蔽
 * 状态应该来自数据库刚刚写入成功的事实，不在前端本地拼一份。
 */
export function useBlockUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BlockUserInput) => blockUser(input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: ["is-blocking", input.blockerId, input.blockedId]
      });
    }
  });
}
