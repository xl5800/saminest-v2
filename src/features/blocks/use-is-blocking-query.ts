import { useQuery } from "@tanstack/react-query";

import { isBlockingUser } from "../../repositories/user-blocks-repository";

/**
 * "我有没有屏蔽这个人"——user-profile-page.tsx 的屏蔽按钮用这个决定当前
 * 显示"屏蔽此人"还是"取消屏蔽"。currentUserId/targetUserId 任一个缺失时
 * 禁用查询（未登录访客、或者还没拿到 URL 里的 userId 参数），这个 hook
 * 只负责按 enabled 挂起查询，不承担"未登录不能屏蔽"这个业务判断——那是
 * 调用方（点击按钮时先判断有没有登录，没有就跳 /login）的职责，跟
 * user-profile-page.tsx 里"发消息"按钮的处理方式一致。
 */
export function useIsBlockingQuery(currentUserId: string | undefined, targetUserId: string | undefined) {
  return useQuery<boolean>({
    queryKey: ["is-blocking", currentUserId, targetUserId],
    queryFn: () => isBlockingUser(currentUserId as string, targetUserId as string),
    enabled: !!currentUserId && !!targetUserId
  });
}
