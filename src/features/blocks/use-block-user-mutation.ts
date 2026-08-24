import { useMutation, useQueryClient } from "@tanstack/react-query";

import { blockUser, type BlockUserInput } from "../../repositories/user-blocks-repository";

/**
 * 屏蔽一个用户。成功后让 useIsBlockingQuery（queryKey
 * ["is-blocking", blockerId, blockedId]）重新拉取，按钮从"屏蔽此人"切到
 * "取消屏蔽"——跟 use-request-account-deletion-mutation.ts 用
 * invalidateQueries 而不是本地 setQueryData 是同一个理由：权威的屏蔽
 * 状态应该来自数据库刚刚写入成功的事实，不在前端本地拼一份。
 *
 * 13 号卡：同时让 useMyBlockedUsersQuery（queryKey
 * ["my-blocked-users", blockerId]）失效——新屏蔽的这个人应该出现在"已
 * 屏蔽"管理列表里。这个 mutation 目前有三个调用方（user-profile-page.tsx/
 * conversation-page.tsx/conversation-swipe-row.tsx），没有一个是"已屏蔽"
 * 管理页本身（那个页面只会调用取消屏蔽），但屏蔽动作本身仍然应该让这份
 * 列表的缓存失效——如果用户在另一个标签页/下次打开"已屏蔽"页面时，应该
 * 看到刚刚屏蔽的这个人，不应该因为缓存没失效而看到一份过期的列表。
 * invalidateQueries 对当前没有挂载/没有被订阅的 query key 只是标记为
 * stale，不会立刻发请求，没有额外开销。
 */
export function useBlockUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BlockUserInput) => blockUser(input),
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
