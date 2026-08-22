import { useQuery } from "@tanstack/react-query";

import {
  getMyAccountDeletionStatus,
  type AccountDeletionStatus
} from "../../repositories/account-deletion-repository";
import { useAuthStore } from "../../store/auth-store";

/**
 * 当前登录用户是否处于注销缓冲期，供 /settings/delete-account 页面判断
 * 展示"发起注销"表单还是"倒计时 + 撤销"两种状态之一。没有登录用户时禁用
 * 查询——这个 hook 只会在被 RequireAuth 包裹的路由里使用，这里的 enabled
 * 只是防御性的，不承担鉴权职责（跟 useMyProfileQuery 是同一个模式）。
 */
export function useAccountDeletionStatusQuery() {
  const userId = useAuthStore((s) => s.session)?.user.id;

  return useQuery<AccountDeletionStatus | null>({
    queryKey: ["account-deletion-status", userId],
    queryFn: () => getMyAccountDeletionStatus(userId as string),
    enabled: !!userId
  });
}
