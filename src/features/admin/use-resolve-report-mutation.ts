import { useMutation } from "@tanstack/react-query";

import { resolveReport } from "../../repositories/admin-repository";

export interface ResolveReportMutationInput {
  reportId: string;
  resolutionNote: string;
}

/**
 * 标记一条举报为已处理。不 invalidateQueries——理由同
 * use-approve-post-mutation.ts，页面成功后自己从本地列表移除这一行。
 */
export function useResolveReportMutation() {
  return useMutation({
    mutationFn: (input: ResolveReportMutationInput) =>
      resolveReport(input.reportId, input.resolutionNote)
  });
}
