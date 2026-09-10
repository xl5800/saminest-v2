import { useState } from "react";

import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { useActivityParticipationQuery } from "./use-activity-participation-query";
import { useToggleActivityParticipationMutation } from "./use-toggle-activity-participation-mutation";

// joinActivity/leaveActivity 抛出的这几个错误码自带已经写好的、安全的
// 用户提示文案，可以直接展示；其它错误码一律回退到本地这条通用文案，见
// activity-participation-button.tsx 原来的同名常量。
const DEFAULT_ERROR_MESSAGE = "操作失败，请稍后重试。";
const KNOWN_SAFE_ERROR_CODES = new Set([
  "ACTIVITY_JOIN_FORBIDDEN",
  "ACTIVITY_JOIN_REJECTED",
  "ACTIVITY_LEAVE_NOT_FOUND"
]);

export interface UseActivityParticipationActionInput {
  activityId: string;
  activityStatus: string;
  organizerId: string;
  activityTitle: string;
  requiresApproval: boolean;
}

/**
 * 报名/申请加入/退出这场活动的完整状态机 + 提交逻辑，从
 * ActivityParticipationButton 内部抽出来的可复用 hook——活动详情页头像
 * 堆叠（ActivityParticipantAvatars）里的"空位"现在也可以点击报名，任务卡
 * 的硬性要求是"空位点击必须接到跟'参加活动'按钮完全同一套状态和逻辑，不能
 * 重复实现一套简化版"（否则两个入口各自维护一份 pending/disabled 判断，
 * 迟早会分裂出"一个觉得还能点、另一个觉得已经在处理中"这类不一致的 bug）。
 *
 * 保证一致性的做法：ActivityDetailPage 只调用这个 hook 一次，拿到的
 * `handleClick`/`disabled`/所有派生状态是同一个 useToggleActivityParticipationMutation
 * 实例、同一次 useActivityParticipationQuery 结果计算出来的——按钮本身
 * （ActivityParticipationButtonView）和头像堆叠的空位共享这一份返回值，
 * 不是各自另起一次 hook 调用、各自读一份状态。ActivityParticipationButton
 * 这个导出名不变，内部换成"调用这个 hook，把返回值交给纯渲染的
 * ActivityParticipationButtonView"，外部用法（props/行为）不变，纯粹是
 * 内部重构。
 *
 * 未登录（userId 为空）时返回一个特殊的 loggedOut 分支，disabled 恒为
 * true、handleClick 是空函数——按钮渲染层遇到这个分支时改渲染"登录后可以
 * 报名"的引导文案（跟原来的行为一致），头像堆叠那边空位也自然不可点
 * （canTapEmptySlot 由页面层用 `!disabled && !isApproved` 算出来，未登录时
 * disabled 恒为 true，天然满足"未登录不能点空位"）。
 *
 * 任务卡（活动详情页——发起人不能报名自己的活动）：新增第三个特殊分支
 * isOrganizer——`userId === organizerId` 时命中，disabled 恒为
 * true、handleClick 是空函数，文案改成"你是发起人，不能报名自己发起的
 * 活动"，跟 loggedOut/isRejected 是同一种"提前短路、不进入正常状态机"的
 * 处理方式。放在 loggedOut 判断之后（这个分支需要真的拿到 userId 才能跟
 * organizerId 比较，未登录时走的还是上面那个分支，不会先命中这里）。
 * 页面层 canTapEmptySlot = `!disabled && !isApproved` 这一行不用跟着改：
 * 这个新分支 disabled 是 true，头像堆叠的空位自然也点不动。
 *
 * 数据库层同步加了一条防线：activity_participants_insert_own 这条 RLS
 * 策略原来完全没有检查"要插入这行的 user_id 是不是这场活动的
 * organizer_id"——只在这里禁用按钮只挡住了正常 UI 路径，直接绕开前端
 * 调 PostgREST insert 完全不受影响。已经在
 * 20260910120000_activity_participants_block_organizer_self_join.sql
 * 里给这条策略加了 `a.organizer_id <> activity_participants.user_id`
 * 这个条件并在本地 Postgres 实测验证过（发起人插入被拒绝、普通用户插入
 * 不受影响），双重保险跟 contact-seller-button.tsx 提到的"数据库函数也会
 * 拒绝"是同一个模式，见该迁移文件顶部注释。
 */
export function useActivityParticipationAction({
  activityId,
  activityStatus,
  organizerId,
  activityTitle,
  requiresApproval
}: UseActivityParticipationActionInput) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: participationStatus, isPending: participationPending } =
    useActivityParticipationQuery(activityId, userId);
  const toggleParticipation = useToggleActivityParticipationMutation();
  const [error, setError] = useState<string | null>(null);

  const isApproved = participationStatus === "approved";
  const isPendingApplication = participationStatus === "pending";
  const isRejected = participationStatus === "rejected";

  if (!userId) {
    return {
      loggedOut: true as const,
      isOrganizer: false as const,
      disabled: true,
      label: "",
      isApproved: false,
      isPendingApplication: false,
      isRejected: false,
      error: null as string | null,
      handleClick: () => {}
    };
  }

  if (userId === organizerId) {
    return {
      loggedOut: false as const,
      isOrganizer: true as const,
      disabled: true,
      label: "你是发起人，不能报名自己发起的活动",
      isApproved: false,
      isPendingApplication: false,
      isRejected: false,
      error: null as string | null,
      handleClick: () => {}
    };
  }

  function handleClick(): void {
    if (
      toggleParticipation.isPending ||
      participationPending ||
      isPendingApplication ||
      isRejected
    ) {
      return;
    }

    setError(null);
    toggleParticipation.mutate(
      {
        activityId,
        // userId 在这个作用域里是 string | undefined（session?.user.id），
        // 但函数顶部的 `if (!userId) return {...}` 已经在真正拿到这个
        // handleClick 闭包之前把"未登录"分支处理掉了——跟
        // use-favorite-post-ids-query.ts 里同样场景下的 `userId as string`
        // 是同一个断言方式，TS 的控制流分析不会把外层 if 的收窄结果带进
        // 下面这个嵌套函数声明里，只能手动断言。
        userId: userId as string,
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

  const disabled =
    participationPending ||
    toggleParticipation.isPending ||
    isPendingApplication ||
    isRejected ||
    (!isApproved && activityStatus !== "open");

  const label = toggleParticipation.isPending
    ? "处理中…"
    : isPendingApplication
      ? "申请中，等待发起人同意"
      : isRejected
        ? "申请已被拒绝"
        : isApproved
          ? "退出活动"
          : activityStatus !== "open"
            ? "报名已满"
            : requiresApproval
              ? "申请加入"
              : "我要报名";

  return {
    loggedOut: false as const,
    isOrganizer: false as const,
    disabled,
    label,
    isApproved,
    isPendingApplication,
    isRejected,
    error,
    handleClick
  };
}
