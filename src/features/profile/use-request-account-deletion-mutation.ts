import { useMutation, useQueryClient } from "@tanstack/react-query";

import { requestAccountDeletion } from "../../repositories/account-deletion-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 发起注销——成功后让 useAccountDeletionStatusQuery（queryKey
 * ["account-deletion-status", userId]）重新拉取，页面从"发起注销"表单
 * 切到"倒计时 + 撤销"状态，跟 useUpdateProfileMutation 用 invalidateQueries
 * 而不是 setQueryData 是同一个理由：权威的 scheduled_purge_at 应该来自
 * 数据库刚刚算出来的值，不在前端本地拼一份。
 */
export function useRequestAccountDeletionMutation() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useMutation({
    mutationFn: requestAccountDeletion,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["account-deletion-status", userId]
      });
    }
  });
}
