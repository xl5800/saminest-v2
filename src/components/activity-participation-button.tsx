import { useState } from "react";
import { Link } from "react-router-dom";

import { useActivityParticipationQuery } from "../features/activities/use-activity-participation-query";
import { useToggleActivityParticipationMutation } from "../features/activities/use-toggle-activity-participation-mutation";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

const DEFAULT_ERROR_MESSAGE = "操作失败，请稍后重试。";

// joinActivity/leaveActivity 抛出的这两个错误码自带已经写好的、安全的
// 用户提示文案，可以直接展示；其它错误码（比如 ACTIVITY_JOIN_FAILED，
// 它的 message 是原始的 Supabase 报错）一律回退到本地这条通用文案，不
// 把底层错误细节露给用户——跟 comment-item.tsx 处理举报错误是同一个模式。
const KNOWN_SAFE_ERROR_CODES = new Set(["ACTIVITY_JOIN_FORBIDDEN", "ACTIVITY_LEAVE_NOT_FOUND"]);

export interface ActivityParticipationButtonProps {
  activityId: string;
  activityStatus: string;
}

/**
 * 报名/退出按钮：跟 FavoriteButton 是同一套"未登录引导登录、已登录直接
 * 操作"的模式，但未登录时不是"点击后跳 /login"，而是直接展示一行"登录后
 * 可以报名"的文字 + 登录链接——这个按钮独占详情页一整行的空间，不像
 * FavoriteButton 嵌在紧凑的列表卡片里，直接展示一个更明确的引导链接比
 * 藏在点击行为背后更直接，跟 comment-section.tsx 顶部评论框未登录态的
 * 处理是同一个思路。
 *
 * activityStatus 不是 'open' 且当前未报名时禁用"报名"操作——
 * activity_participants_insert_own 这条 RLS 策略本身也只在 status = 'open'
 * 时放行报名，这里在 UI 层提前判断，尽量在前端先挡住，不要让用户点了却
 * 看到一个"活动已满员"这种服务端才知道的报错。"退出"不受这个限制：已经
 * 报名的人不管活动之后变成什么状态，都应该能退出。
 */
export function ActivityParticipationButton({
  activityId,
  activityStatus
}: ActivityParticipationButtonProps) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: isJoined, isPending: participationPending } = useActivityParticipationQuery(
    activityId,
    userId
  );
  const toggleParticipation = useToggleActivityParticipationMutation();
  const [error, setError] = useState<string | null>(null);

  if (!userId) {
    return (
      <p className="text-sm text-text-muted">
        <Link to="/login" className="text-primary hover:underline">
          登录
        </Link>
        后可以报名
      </p>
    );
  }

  const joined = Boolean(isJoined);

  function handleClick(): void {
    if (toggleParticipation.isPending || participationPending || !userId) return;

    setError(null);
    toggleParticipation.mutate(
      { activityId, userId, isCurrentlyJoined: joined },
      {
        onError: (mutationError) => {
          setError(
            mutationError instanceof AppError &&
              KNOWN_SAFE_ERROR_CODES.has(mutationError.code)
              ? mutationError.message
              : DEFAULT_ERROR_MESSAGE
          );
        }
      }
    );
  }

  const disabled =
    participationPending || toggleParticipation.isPending || (!joined && activityStatus !== "open");

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className="w-full rounded-xl bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {toggleParticipation.isPending
          ? "处理中…"
          : joined
            ? "退出活动"
            : activityStatus !== "open"
              ? "报名已满"
              : "我要报名"}
      </button>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
