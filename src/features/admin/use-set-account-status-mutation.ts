import { useMutation } from "@tanstack/react-query";

import { setAccountStatus } from "../../repositories/admin-repository";

export interface SetAccountStatusMutationInput {
  userId: string;
  newStatus: "active" | "restricted" | "suspended";
  reason: string;
}

/**
 * 设置某个用户的账号状态（走 set_account_status RPC）。不 invalidateQueries——
 * 理由同 use-delete-post-mutation.ts，调用方（users-page.tsx）成功后自己
 * 更新本地那一行的 accountStatus，不需要整份列表重新 fetch。
 */
export function useSetAccountStatusMutation() {
  return useMutation({
    mutationFn: (input: SetAccountStatusMutationInput) =>
      setAccountStatus(input.userId, input.newStatus, input.reason)
  });
}
