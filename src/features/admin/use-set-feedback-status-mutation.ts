import { useMutation } from "@tanstack/react-query";

import { setFeedbackStatus } from "../../repositories/feedback-repository";

export interface SetFeedbackStatusMutationInput {
  feedbackId: string;
  newStatus: string;
}

/**
 * 修改一条反馈的处理状态。不 invalidateQueries——理由同
 * use-resolve-report-mutation.ts，页面成功后自己从本地列表移除这一行。
 */
export function useSetFeedbackStatusMutation() {
  return useMutation({
    mutationFn: (input: SetFeedbackStatusMutationInput) =>
      setFeedbackStatus(input.feedbackId, input.newStatus)
  });
}
