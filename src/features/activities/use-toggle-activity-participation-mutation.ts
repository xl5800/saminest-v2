import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createActivityConversation } from "../../repositories/conversations-repository";
import { joinActivity, leaveActivity } from "../../repositories/activities-repository";
import { sendMessage } from "../../repositories/messages-repository";
import { getMyProfile } from "../../repositories/profiles-repository";

export interface ToggleActivityParticipationInput {
  activityId: string;
  userId: string;
  isCurrentlyJoined: boolean;
  organizerId: string;
  activityTitle: string;
  /** 目标活动是不是需要发起人审核——决定 joinActivity 插入的行是
   *  'approved' 还是 'pending'，也决定通知发起人的消息文案用"报名了"还是
   *  "申请加入"。退出方向（isCurrentlyJoined=true）不会用到这个字段，但
   *  两个方向共用同一个输入类型，调用方（ActivityParticipationButton /
   *  my-activities-page.tsx）反正手上都有 ActivityListItem/ActivityDetail
   *  里现成的 requiresApproval，统一必填不加可选问号，比"退出方向可以
   *  不传"这种分叉类型定义更简单。 */
  requiresApproval: boolean;
}

const DEFAULT_ACTOR_LABEL = "有人";

/**
 * 报名/退出通知发起人：给这次操作者本人和发起人之间的私聊会话发一条消息，
 * 发送人是操作者本人（不是虚拟系统账号），这样发起人可以直接在同一个
 * 对话里回复——设计文档第 7 节"第二批"要求，措辞用任务给的参考文案。
 *
 * P2 报名审核制加了第三种文案：requiresApproval = true 时，joinActivity
 * 插入的是一条 pending 申请，不是"报名成功"，"报名了"这个措辞会误导发起人
 * 以为不需要再处理——改成"申请加入…去处理一下"，提示发起人这条需要他
 * 采取行动，跟真正报名成功（不需要审核）区分开。
 *
 * 发起人自己报名/退出自己的活动这种边界情况（正常 UI 不会出现这个按钮，
 * 这里只是防御）不发通知——不需要、也不应该给自己发私信。
 *
 * 用 getMyProfile 而不是从调用方（ActivityParticipationButton）传入
 * 一个已经在别处查好的 displayName：这个函数没有 React 渲染上下文，直接
 * 在这里按需查一次，比要求所有调用方都提前拉好当前用户 profile、再往
 * mutate() 里多塞一个参数更简单，也更不容易在某个调用点漏传导致消息里
 * 显示不出名字。
 *
 * 30 号卡（打通"活动申请通知"到审核页面的跳转）：只有"申请加入（需要
 * 审核）"这一条消息才带上 ref_activity_id——这是发起人真正需要点进去处理
 * 的那一种，"报名了"（不需要审核，已经是既成事实）和"退出了"都不需要一个
 * "查看申请"的跳转入口，所以这两条消息的 ref_activity_id 保持不填（继续
 * 传 undefined，sendMessage 会写 null）。conversation-page.tsx 就是靠这一
 * 列有没有值，判断要不要在这条消息气泡下面渲染"查看申请 →"链接，不需要
 * 解析 body 文本内容找活动。
 */
async function notifyOrganizer(input: ToggleActivityParticipationInput): Promise<void> {
  if (input.organizerId === input.userId) return;

  const actorProfile = await getMyProfile(input.userId);
  const actorDisplayName = actorProfile?.displayName ?? DEFAULT_ACTOR_LABEL;

  const isApprovalRequest = !input.isCurrentlyJoined && input.requiresApproval;
  const body = input.isCurrentlyJoined
    ? `${actorDisplayName} 退出了你的活动《${input.activityTitle}》`
    : input.requiresApproval
      ? `${actorDisplayName} 申请加入你的活动《${input.activityTitle}》，去处理一下吧。`
      : `${actorDisplayName} 报名了你的活动《${input.activityTitle}》`;

  const { conversationId } = await createActivityConversation(input.activityId);
  await sendMessage({
    conversationId,
    senderId: input.userId,
    body,
    refActivityId: isApprovalRequest ? input.activityId : undefined
  });
}

/**
 * 报名/退出的开关：根据调用方传入的当前报名状态决定调 joinActivity 还是
 * leaveActivity，跟 use-toggle-favorite-mutation.ts 是同一个模式。
 *
 * 通知发起人是报名/退出成功之后的附加动作，用 try/catch 包起来、失败只
 * console.error，不让通知发送失败反过来导致整个报名/退出操作被判定为
 * 失败——用户已经成功报名/退出了，这是既成事实，不应该因为私信这个次要
 * 功能的网络抖动或其它问题被回退成一个错误提示，跟 publish-page.tsx 里
 * "图片上传失败不影响帖子已经创建成功"是同一个"核心操作与次要副作用分开
 * 判定成败"的原则。
 *
 * 不自己维护 participant_count（设计文档第 5 点要求），成功后
 * invalidate 四个 queryKey，让页面重新拉取权威数据：
 * - ["activity-detail", activityId]：详情页头部的 participant_count 汇总
 *   数字由数据库触发器同步，要重新拉才能看到最新值。
 * - ["activity-participation", activityId, userId]：按钮自己的报名状态
 *   （P2 起是四态，不只是布尔）。
 * - ["activities"]：列表页（前缀匹配，覆盖所有筛选条件组合）的
 *   participant_count/status（满员会从 open 变成 full）也可能变了。
 * - ["activity-participants", activityId]：第二批新增的"参与者"名单区块，
 *   报名/退出后名单本身也变了，要跟着刷新。
 */
export function useToggleActivityParticipationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ToggleActivityParticipationInput) => {
      if (input.isCurrentlyJoined) {
        await leaveActivity(input.activityId, input.userId);
      } else {
        await joinActivity(input.activityId, input.userId, input.requiresApproval);
      }

      try {
        await notifyOrganizer(input);
      } catch (notifyError) {
        console.error("活动报名/退出通知发送失败：", notifyError);
      }
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["activity-detail", variables.activityId]
      });
      void queryClient.invalidateQueries({
        queryKey: ["activity-participation", variables.activityId, variables.userId]
      });
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
      void queryClient.invalidateQueries({
        queryKey: ["activity-participants", variables.activityId]
      });
    }
  });
}
