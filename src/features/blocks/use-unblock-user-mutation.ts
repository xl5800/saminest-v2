import { useMutation, useQueryClient } from "@tanstack/react-query";

import { unblockUser, type UnblockUserInput } from "../../repositories/user-blocks-repository";

/**
 * 取消屏蔽一个用户。成功后让 useIsBlockingQuery 重新拉取，按钮从
 * "取消屏蔽"切回"屏蔽此人"，跟 use-block-user-mutation.ts 是同一个理由。
 *
 * 13 号卡：同时让 useMyBlockedUsersQuery（queryKey
 * ["my-blocked-users", blockerId]）失效——这是 blocked-users-page.tsx
 * （"已屏蔽"管理页）"取消屏蔽"按钮的直接调用点，页面本身不需要再手动
 * invalidate 或者拼一份本地 state 去把这一行从列表里移除，这个 mutation
 * 成功之后自然会让列表重新拉取、少了这一行，见该页面组件的注释。
 */
export function useUnblockUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UnblockUserInput) => unblockUser(input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: ["is-blocking", input.blockerId, input.blockedId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["my-blocked-users", input.blockerId]
      });
    }
  });
}
