import { useMutation } from "@tanstack/react-query";

import { dismissReport } from "../../repositories/admin-repository";

export interface DismissReportMutationInput {
  reportId: string;
  resolutionNote: string;
}

/**
 * 驳回一条举报（判定为不成立）。不 invalidateQueries——理由同
 * use-approve-post-mutation.ts，页面成功后自己从本地列表移除这一行。
 */
export function useDismissReportMutation() {
  return useMutation({
    mutationFn: (input: DismissReportMutationInput) =>
      dismissReport(input.reportId, input.resolutionNote)
  });
}
