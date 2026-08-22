import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cancelAccountDeletion } from "../../repositories/account-deletion-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 撤销注销——成功后让 useAccountDeletionStatusQuery 重新拉取，页面从
 * "倒计时 + 撤销"状态切回"发起注销"表单，跟
 * use-request-account-deletion-mutation.ts 是同一个理由。
 */
export function useCancelAccountDeletionMutation() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["account-deletion-status", userId]
      });
    }
  });
}
