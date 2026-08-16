import { useState } from "react";
import { Link } from "react-router-dom";

import { useActivityParticipationQuery } from "../features/activities/use-activity-participation-query";
import { useToggleActivityParticipationMutation } from "../features/activities/use-toggle-activity-participation-mutation";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";

const DEFAULT_ERROR_MESSAGE = "操作失败，请稍后重试。";

// joinActivity/leaveActivity 抛出的这几个错误码自带已经写好的、安全的
// 用户提示文案，可以直接展示；其它错误码（比如 ACTIVITY_JOIN_FAILED，
// 它的 message 是原始的 Supabase 报错）一律回退到本地这条通用文案，不
// 把底层错误细节露给用户——跟 comment-item.tsx 处理举报错误是同一个模式。
// ACTIVITY_JOIN_REJECTED（P2 新增：撞上一条已被拒绝的历史申请，见
// activities-repository.ts 的 joinActivity 注释）也在这个白名单里。
const KNOWN_SAFE_ERROR_CODES = new Set([
  "ACTIVITY_JOIN_FORBIDDEN",
  "ACTIVITY_JOIN_REJECTED",
  "ACTIVITY_LEAVE_NOT_FOUND"
]);

const SECONDARY_BUTTON_CLASS_NAME =
  "w-full rounded-xl border border-border px-4 py-2 font-semibold text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60";
const PRIMARY_BUTTON_CLASS_NAME =
  "w-full rounded-xl bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60";

export interface ActivityParticipationButtonProps {
  activityId: string;
  activityStatus: string;
  /** 通知消息的收件人——报名/退出成功后要提醒的活动发起人。 */
  organizerId: string;
  /** 通知消息文案里要嵌入的活动标题，见 use-toggle-activity-participation-mutation.ts。 */
  activityTitle: string;
  /** 这场活动要不要发起人审核才能加入（P2）——决定按钮文案是"我要报名"
   *  还是"申请加入"，以及 joinActivity 插入的行是 approved 还是 pending。 */
  requiresApproval: boolean;
}

/**
 * 报名/申请加入/退出按钮：跟 FavoriteButton 是同一套"未登录引导登录、
 * 已登录直接操作"的模式，但未登录时不是"点击后跳 /login"，而是直接展示
 * 一行"登录后可以报名"的文字 + 登录链接——这个按钮独占详情页一整行的
 * 空间，不像 FavoriteButton 嵌在紧凑的列表卡片里，直接展示一个更明确的
 * 引导链接比藏在点击行为背后更直接，跟 comment-section.tsx 顶部评论框
 * 未登录态的处理是同一个思路。
 *
 * P2 报名审核制上线后，报名状态从布尔"是否已报名"扩成四态
 * （getActivityParticipationStatus 的返回值），按钮要表达五种界面状态：
 * - 未参与、不需要审核：实心蓝"我要报名"，点击 → 直接 approved。
 * - 未参与、需要审核：实心蓝"申请加入"，点击 → 落地为 pending。
 * - pending：不可点的状态提示"申请中，等待发起人同意"（仍然渲染成一个
 *   disabled 的按钮，跟原来"报名已满"的处理方式一致，不是纯文字）。
 * - approved：跟原来一样的描边次要样式"退出活动"。
 * - rejected：不渲染任何 <button>，只显示一行"申请已被拒绝"的纯文字——
 *   跟 pending 刻意用不同的呈现方式（disabled 按钮 vs 纯文字）：pending
 *   至少还是个"正在进行中的操作"，保留按钮的视觉语言合理；rejected 是一个
 *   终态，不可能再有任何点击行为通向它，用纯文字更准确地传达"这里没有
 *   可操作的东西"，不是"这里有个操作但暂时不能点"。
 *
 * activityStatus 不是 'open' 且当前未参与时禁用"报名/申请"操作——
 * activity_participants_insert_own 这条 RLS 策略本身也只在 status = 'open'
 * 时放行插入，这里在 UI 层提前判断，尽量在前端先挡住，不要让用户点了却
 * 看到一个"活动已满员"这种服务端才知道的报错。"退出"不受这个限制：已经
 * 报名/申请中的人不管活动之后变成什么状态，都应该能退出/撤回。
 */
export function ActivityParticipationButton({
  activityId,
  activityStatus,
  organizerId,
  activityTitle,
  requiresApproval
}: ActivityParticipationButtonProps) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: participationStatus, isPending: participationPending } =
    useActivityParticipationQuery(activityId, userId);
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

  const isApproved = participationStatus === "approved";
  const isPendingApplication = participationStatus === "pending";
  const isRejected = participationStatus === "rejected";

  function handleClick(): void {
    if (
      toggleParticipation.isPending ||
      participationPending ||
      !userId ||
      isPendingApplication ||
      isRejected
    ) {
      return;
    }

    setError(null);
    toggleParticipation.mutate(
      {
        activityId,
        userId,
        isCurrentlyJoined: isApproved,
        organizerId,
        activityTitle,
        requiresApproval
      },
      {
        onError: (mutationError) => {
          setError(
            mutationError instanceof AppError && KNOWN_SAFE_ERROR_CODES.has(mutationError.code)
              ? mutationError.message
              : DEFAULT_ERROR_MESSAGE
          );
        }
      }
    );
  }

  const errorBanner = error ? (
    <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  ) : null;

  if (isRejected) {
    return (
      <div>
        <p className="w-full rounded-xl border border-border px-4 py-2 text-center text-sm text-text-muted">
          申请已被拒绝
        </p>
        {errorBanner}
      </div>
    );
  }

  const disabled =
    participationPending ||
    toggleParticipation.isPending ||
    isPendingApplication ||
    (!isApproved && activityStatus !== "open");

  const label = toggleParticipation.isPending
    ? "处理中…"
    : isPendingApplication
      ? "申请中，等待发起人同意"
      : isApproved
        ? "退出活动"
        : activityStatus !== "open"
          ? "报名已满"
          : requiresApproval
            ? "申请加入"
            : "我要报名";

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={isApproved ? SECONDARY_BUTTON_CLASS_NAME : PRIMARY_BUTTON_CLASS_NAME}
      >
        {label}
      </button>
      {errorBanner}
    </div>
  );
}
