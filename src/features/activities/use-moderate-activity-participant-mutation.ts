import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  approveActivityParticipant,
  rejectActivityParticipant
} from "../../repositories/activities-repository";

export interface ModerateActivityParticipantInput {
  participantId: string;
  decision: "approve" | "reject";
}

/**
 * 发起人处理一条报名申请（同意/拒绝）。
 *
 * 通知申请人这一步这次改成完全交给数据库：
 * approve_activity_participant/reject_activity_participant 这两个 RPC
 * 现在自己在函数体末尾调用 notify_user()（见
 * 20260914050110_notify_applicant_on_activity_moderation.sql），不再需要
 * 这个 hook 额外发一条私信——之前这里有一个 notifyApplicant()，靠
 * findExistingActivityConversation() 去找申请人当初申请时建好的会话，找
 * 不到就静默跳过、不发通知也不报错，是一个真实的可靠性缺口；换成数据库
 * 层的 notify_user() 之后不再依赖会话是否存在，且避免了"申请人同时收到
 * 一条私信 + 一条系统通知"这种重复体验。`applicantId`/`organizerId`/
 * `activityTitle` 三个字段也是只为了喂给那个已删除的 notifyApplicant()
 * 才存在的，跟着一起从这个类型和调用点（my-activities-page.tsx）里
 * 去掉，不留死代码。
 *
 * 不在这里做本地列表更新（从待处理列表移除这条申请、给对应活动的
 * participant_count/status 加一）——那是 my-activities-page.tsx 自己的
 * UI 状态管理，跟这个仓库其它 mutation hook（比如
 * useCancelActivityMutation）的分工一致：hook 只管调用 repository 函数 +
 * 可选的查询失效，页面自己决定拿到成功结果之后本地状态怎么变。
 *
 * invalidate ["activity-pending-participants"]（前缀匹配）是防御性的：
 * 目前唯一的调用方 my-activities-page.tsx 用本地 state 直接移除这条申请，
 * 不依赖这次失效来更新界面，但如果以后有其它地方也用
 * usePendingActivityParticipantsQuery，不写这行会导致它们的缓存悄悄过期。
 */
export function useModerateActivityParticipantMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ModerateActivityParticipantInput) => {
      if (input.decision === "approve") {
        await approveActivityParticipant(input.participantId);
      } else {
        await rejectActivityParticipant(input.participantId);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activity-pending-participants"] });
    }
  });
}
