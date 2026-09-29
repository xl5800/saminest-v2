import { useQuery } from "@tanstack/react-query";

import { countPendingReports } from "../../repositories/reports-repository";

/**
 * 管理后台顶部 Tab「举报处理」角标用的数量查询（功能改动清单第 7 项）。
 * 跟 use-reports-query.ts（拉某个状态下的整份举报列表，给 reports-page.tsx
 * 用）是两个独立的查询，理由跟 use-pending-posts-count-query.ts 一致，
 * 见该文件注释——这里不重复。
 */
export function usePendingReportsCountQuery() {
  return useQuery<number>({
    queryKey: ["admin", "pending-reports-count"],
    queryFn: countPendingReports
  });
}
