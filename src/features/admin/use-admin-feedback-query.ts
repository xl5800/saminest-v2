import { useQuery } from "@tanstack/react-query";

import {
  type AdminFeedbackListItem,
  listFeedbackForAdmin
} from "../../repositories/feedback-repository";

/**
 * 管理员"联系客服"处理队列，按状态过滤。照抄 use-reports-query.ts 的结构：
 * setFeedbackStatus 成功后页面直接从本地列表移除对应行，不依赖这个查询
 * 重新 fetch。
 */
export function useAdminFeedbackQuery(status: string) {
  return useQuery<AdminFeedbackListItem[]>({
    queryKey: ["admin", "feedback", status],
    queryFn: () => listFeedbackForAdmin(status)
  });
}
