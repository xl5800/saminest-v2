import { useMutation } from "@tanstack/react-query";

import { notifyActivityParticipants } from "../../repositories/activities-repository";

export interface NotifyActivityParticipantsMutationInput {
  activityId: string;
  body: string;
}

/**
 * 任务卡 4：发起人群发通知参与者。跟 useCancelActivityMutation/
 * useCreateReportMutation 是同一个最简 Mutation Hook 模式（AI-Development.md
 * 5.4/5.5 要求新增数据请求封装成独立的 Query/Mutation Hook，不在页面组件
 * 里直接调用 Repository）——不 invalidateQueries：发送成功后页面本身留在
 * 原地展示"通知已发送"提示（任务卡明确要求，不自动跳转），没有任何本地
 * 列表/缓存需要因为这次群发而刷新。
 */
export function useNotifyActivityParticipantsMutation() {
  return useMutation({
    mutationFn: (input: NotifyActivityParticipantsMutationInput) =>
      notifyActivityParticipants(input.activityId, input.body)
  });
}
