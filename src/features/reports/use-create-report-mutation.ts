import { useMutation } from "@tanstack/react-query";

import { createReport } from "../../repositories/reports-repository";

export interface CreateReportMutationInput {
  reporterId: string;
  targetType: "post";
  targetId: string;
  reasonCode: string;
  description: string | null;
}

/**
 * 提交举报。这一轮没有"我的举报列表"之类的 UI（见任务范围说明），提交成功
 * 后没有需要失效的查询，所以不像 useToggleFavoriteMutation 那样在
 * onSuccess 里 invalidateQueries。
 */
export function useCreateReportMutation() {
  return useMutation({
    mutationFn: (input: CreateReportMutationInput) => createReport(input)
  });
}
