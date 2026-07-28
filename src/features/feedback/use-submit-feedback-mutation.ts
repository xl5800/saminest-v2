import { useMutation } from "@tanstack/react-query";

import { createFeedback } from "../../repositories/feedback-repository";

export interface SubmitFeedbackMutationInput {
  userId: string;
  type: string;
  title: string;
  content: string;
}

/**
 * 提交反馈的文字部分（type/title/content）。这一轮没有"我的反馈列表"之类
 * 的 UI（后台管理界面也不做），提交成功后没有需要失效的查询，所以不像
 * useToggleFavoriteMutation 那样在 onSuccess 里 invalidateQueries——跟
 * use-create-report-mutation.ts 是同一个理由。
 *
 * 截图上传是单独一步（见 submit-feedback-page.tsx 的
 * uploadAndInsertFeedbackImages，照抄 publish-page.tsx 的
 * uploadAndInsertPostImages 模式），不在这个 mutation 里一起做——反馈行
 * 必须先创建成功、拿到 feedbackId，截图才有地方挂，两步天然有先后依赖，
 * 硬塞进一个 mutation 里不会让代码更简单。
 */
export function useSubmitFeedbackMutation() {
  return useMutation({
    mutationFn: (input: SubmitFeedbackMutationInput) => createFeedback(input)
  });
}
