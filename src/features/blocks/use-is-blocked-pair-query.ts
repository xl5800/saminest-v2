import { useQuery } from "@tanstack/react-query";

import { isBlockedWithUser } from "../../repositories/user-blocks-repository";

/**
 * "当前用户和会话对方之间是否存在任一方向的屏蔽关系"——
 * conversation-page.tsx 用这个提前把发送框换成一条提示文案，见
 * user-blocks-repository.ts 里 isBlockedWithUser() 的注释。currentUserId/
 * otherUserId 任一个缺失时禁用查询（未登录、系统通知会话没有"对方"、
 * 对方已退出会话导致 otherUserId 为 null 等情况）。
 *
 * 这个 hook 自己的外部签名（currentUserId + otherUserId 两个参数）修复
 * is_blocked_pair 越权查询漏洞之后没有变——currentUserId 仍然用于
 * enabled 判断（未登录时不发起查询）和 queryKey（按用户维度隔离缓存，
 * 避免账号切换后读到上一个用户缓存的结果），只是内部实际调用
 * isBlockedWithUser() 时不再需要显式传 currentUserId：谁是"当前用户"现在
 * 由后端从请求的 JWT 里自己判断，不接受前端传参指定，调用方传别的值也
 * 不会被信任。
 */
export function useIsBlockedPairQuery(currentUserId: string | undefined, otherUserId: string | undefined) {
  return useQuery<boolean>({
    queryKey: ["is-blocked-pair", currentUserId, otherUserId],
    queryFn: () => isBlockedWithUser(otherUserId as string),
    enabled: !!currentUserId && !!otherUserId
  });
}
