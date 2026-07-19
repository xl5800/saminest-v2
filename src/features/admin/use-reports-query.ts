import { useQuery } from "@tanstack/react-query";

import {
  type AdminReportListItem,
  listReportsForModeration
} from "../../repositories/reports-repository";

/**
 * 管理员举报处理队列，按状态过滤（默认 "pending"）。跟
 * use-pending-posts-query.ts 一样，resolve/dismiss 成功后页面直接从本地
 * 列表移除对应行，不依赖这个查询重新 fetch。
 */
export function useReportsQuery(status: string) {
  return useQuery<AdminReportListItem[]>({
    queryKey: ["admin", "reports", status],
    queryFn: () => listReportsForModeration(status)
  });
}
