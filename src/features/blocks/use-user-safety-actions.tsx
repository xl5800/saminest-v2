import { Ban, Flag } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import { useAuthStore } from "../../store/auth-store";
import { useBlockUserMutation } from "./use-block-user-mutation";
import { useIsBlockingQuery } from "./use-is-blocking-query";
import { useUnblockUserMutation } from "./use-unblock-user-mutation";

const MENU_ITEM_CLASS_NAME = "flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-bg";
const BLOCK_ERROR_MESSAGE = "操作失败，请稍后重试。";

/**
 * 苹果审核 1.2 整改：帖子详情、社区帖子、活动详情、评论里"举报用户 / 屏蔽此人"
 * 两个操作共用的逻辑。原来这两个入口只在用户主页和私信页里，用户主页现在被
 * 功能开关关着，所以在内容旁边再放一份，不用打开主页也能操作。
 *
 * - 没登录，或者对方就是自己时，canAct 为 false，调用方不渲染这两项。
 * - "屏蔽此人"先弹确认（confirmSheet，调用方渲染在页面里），确认后写
 *   user_blocks；已经屏蔽的显示"取消屏蔽"，点了直接取消。
 * - 举报用户复用现有的 /users/:userId/report 页面（这个路由不受用户主页
 *   开关影响）。
 */
export function useUserSafetyActions(
  targetUserId: string | null | undefined,
  targetName: string,
  options: { skipStatusQuery?: boolean } = {}
) {
  const currentUserId = useAuthStore((s) => s.session)?.user.id;
  const canAct = Boolean(currentUserId && targetUserId && currentUserId !== targetUserId);
  // 评论列表里每条评论都要这两个操作，不能每条都查一次"有没有屏蔽"：被屏蔽的人
  // 的评论本来就不显示，所以评论里传 skipStatusQuery，只提供"屏蔽"。
  const queryEnabled = canAct && !options.skipStatusQuery;
  const { data: isBlocking } = useIsBlockingQuery(
    queryEnabled ? currentUserId : undefined,
    queryEnabled ? (targetUserId ?? undefined) : undefined
  );
  const blockUser = useBlockUserMutation();
  const unblockUser = useUnblockUserMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);

  function requestBlockToggle(): void {
    if (!canAct || !currentUserId || !targetUserId) return;
    setError(null);
    if (isBlocking) {
      unblockUser.mutate(
        { blockerId: currentUserId, blockedId: targetUserId },
        { onError: () => setError(BLOCK_ERROR_MESSAGE), onSuccess: () => setBlockedNotice(null) }
      );
      return;
    }
    setConfirmOpen(true);
  }

  function confirmBlock(): void {
    if (!currentUserId || !targetUserId) return;
    blockUser.mutate(
      { blockerId: currentUserId, blockedId: targetUserId },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setBlockedNotice(`已屏蔽 ${targetName}，你不会再看到对方发布的内容。`);
        },
        onError: () => setError(BLOCK_ERROR_MESSAGE)
      }
    );
  }

  const reportPath = targetUserId ? `/users/${targetUserId}/report` : "";
  const blockLabel = isBlocking ? "取消屏蔽" : "屏蔽此人";

  /** 放进 TopBar 的"…"菜单里的两项。 */
  const menuItems: ReactNode = canAct ? (
    <>
      <Link to={reportPath} className={MENU_ITEM_CLASS_NAME}>
        <Flag size={16} aria-hidden="true" />
        举报用户
      </Link>
      <button type="button" onClick={requestBlockToggle} className={MENU_ITEM_CLASS_NAME}>
        <Ban size={16} aria-hidden="true" />
        {blockLabel}
      </button>
    </>
  ) : null;

  const confirmSheet: ReactNode = confirmOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="屏蔽此人"
      className="fixed inset-0 z-30 flex items-end bg-overlay"
      onClick={() => setConfirmOpen(false)}
    >
      <div
        className="w-full rounded-t-3xl bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-lg font-semibold text-text">屏蔽 {targetName}？</p>
        <p className="mt-2 text-sm leading-6 text-text-body">
          屏蔽后，你不会再看到对方发布的帖子、社区帖子、评论和活动，对方也不能再给你发私信。可以在"我的 → 已屏蔽"里取消。
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={confirmBlock}
          disabled={blockUser.isPending}
          className="mt-5 w-full rounded-full bg-danger py-3 text-base font-semibold text-white disabled:opacity-60"
        >
          {blockUser.isPending ? "处理中…" : "屏蔽"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(false)}
          className="mt-2 w-full py-2.5 text-sm text-text-muted"
        >
          取消
        </button>
      </div>
    </div>
  ) : null;

  /** 屏蔽成功 / 取消屏蔽失败的一行提示，调用方放在页面内容顶部。 */
  const statusMessage: ReactNode =
    blockedNotice || (error && !confirmOpen) ? (
      <p role={error && !confirmOpen ? "alert" : "status"} className="mb-3 rounded-xl bg-field px-3 py-2 text-sm text-text-body">
        {error && !confirmOpen ? error : blockedNotice}
      </p>
    ) : null;

  return {
    canAct,
    isBlocking: Boolean(isBlocking),
    blockLabel,
    reportPath,
    requestBlockToggle,
    menuItems,
    confirmSheet,
    statusMessage
  };
}
