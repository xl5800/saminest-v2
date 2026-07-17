import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

// Postgres/PostgREST 的 unique_violation 错误码，对应 reports 表的
// reports_reporter_active_target_unique_idx 部分唯一索引（见
// supabase/migrations/20260716000300_create_reports_table.sql）。
const UNIQUE_VIOLATION_CODE = "23505";

/**
 * 举报原因可选值，对应 reports 表 reason_code 的 check 约束（迁移文件
 * reports_reason_code_check），中文文案供表单展示用。
 */
export const REPORT_REASON_OPTIONS = [
  { value: "scam", label: "诈骗" },
  { value: "spam", label: "广告/垃圾信息" },
  { value: "duplicate", label: "重复发布" },
  { value: "illegal_content", label: "违规内容" },
  { value: "misleading", label: "虚假/误导信息" },
  { value: "harassment", label: "骚扰" },
  { value: "privacy", label: "侵犯隐私" },
  { value: "other", label: "其他" }
] as const;

export type ReportReasonCode = (typeof REPORT_REASON_OPTIONS)[number]["value"];

export interface CreateReportInput {
  reporterId: string;
  targetType: "post";
  targetId: string;
  reasonCode: string;
  description: string | null;
}

export interface CreateReportResult {
  id: string;
}

/**
 * 提交一条举报。
 *
 * reports_reporter_active_target_unique_idx 部分唯一索引保证同一用户对同一
 * (target_type, target_id) 最多只能有一条非终结状态（pending/reviewing）的
 * 举报。撞上这个约束（错误码 23505）说明用户已经举报过且还在处理中——这里
 * 不像 favorites 的重复收藏那样当成"静默成功"，而是转换成一个专门的
 * AppError（code: REPORT_DUPLICATE），让调用方能展示"您已经举报过"这样明确
 * 的提示，而不是把原始数据库错误抛给用户。
 */
export async function createReport(
  input: CreateReportInput
): Promise<CreateReportResult> {
  const payload: TablesInsert<"reports"> = {
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    reason_code: input.reasonCode,
    description: input.description
  };

  const { data, error } = await getSupabaseClient()
    .from("reports")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      throw new AppError(
        "您已经举报过这条内容，正在处理中，请勿重复提交。",
        "REPORT_DUPLICATE",
        error
      );
    }
    throw new AppError(error.message, "REPORT_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("提交举报后无法读取举报 ID。", "REPORT_CREATE_ID_MISSING");
  }

  return { id: data.id };
}
