import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  approveActivityParticipant,
  rejectActivityParticipant
} from "../../repositories/activities-repository";
import { findExistingActivityConversation } from "../../repositories/conversations-repository";
import { sendMessage } from "../../repositories/messages-repository";

export interface ModerateActivityParticipantInput {
  participantId: string;
  decision: "approve" | "reject";
  /** 被同意/拒绝的申请人——通知的收件人。 */
  applicantId: string;
  /** 当前操作者（发起人）——通知的发送人，措辞见 notifyApplicant。 */
  organizerId: string;
  activityTitle: string;
}

/**
 * 发起人同意/拒绝申请成功后，反过来通知申请人——跟
 * use-toggle-activity-participation-mutation.ts 的 notifyOrganizer 是
 * 相反方向的同一个模式，但不能直接复用 createActivityConversation：那个
 * RPC 固定把"对方"解析成活动的 organizer_id，发起人自己调用时"调用者"和
 * "解析出来的对方"是同一个人，会撞上 RPC 自己的"不能和自己建会话"防御
 * 检查。这次任务范围明确"数据库已完成，不用碰"，不新增 RPC，改用
 * findExistingActivityConversation 去找申请人当初申请时已经建好的那条
 * 会话，找不到就静默跳过（不阻塞同意/拒绝本身）——细节和这个设计选择的
 * 局限性见 conversations-repository.ts 里那个函数的详细注释。
 */
async function notifyApplicant(input: ModerateActivityParticipantInput): Promise<void> {
  if (input.applicantId === input.organizerId) return;

  const conversation = await findExistingActivityConversation({
    createdByUserId: input.applicantId,
    otherUserId: input.organizerId
  });
  if (!conversation) return;

  const verb = input.decision === "approve" ? "被同意了" : "被拒绝了";
  await sendMessage({
    conversationId: conversation.conversationId,
    senderId: input.organizerId,
    body: `你申请加入的《${input.activityTitle}》${verb}`
  });
}

/**
 * 发起人处理一条报名申请（同意/拒绝）。通知申请人是核心操作成功之后的
 * 附加动作，用 try/catch 包起来、失败只 console.error，不影响同意/拒绝
 * 本身的成败——跟 notifyOrganizer 那边"核心操作与次要副作用分开判定成败"
 * 是同一个原则。
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

      try {
        await notifyApplicant(input);
      } catch (notifyError) {
        console.error("活动报名审核通知发送失败：", notifyError);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["activity-pending-participants"] });
    }
  });
}
