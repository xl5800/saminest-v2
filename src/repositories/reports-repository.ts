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

export interface AdminReportListItem {
  id: string;
  reasonCode: string;
  createdAt: string;
  targetType: string;
  targetId: string;
  reporterName: string;
}

interface AdminReportRow {
  id: string;
  reason_code: string;
  created_at: string;
  target_type: string;
  target_id: string;
  reporter: { display_name: string } | null;
}

/**
 * 管理员举报处理队列用。跟公开的举报提交流程刻意不向任何人（包括被举报的
 * 帖子作者）展示举报人身份不同，这是内部管理后台，管理员需要知道是谁提交
 * 的举报（判断是否恶意举报、是否需要联系举报人等），所以用嵌套 select 把
 * profiles.display_name（通过 reporter_id）一并带出来。
 *
 * status 支持按参数过滤（"如果这部分复杂就先只做 pending 列表"——实际实现
 * 起来只是多一个 .eq("status", status)，成本很低，所以没有省略，默认值是
 * "pending"，跟 reports_status_check 约束里的四个取值一致）。
 *
 * reports 表对 profiles 有两个外键（reporter_id 和 reviewer_id），嵌套
 * select 写 `profiles(display_name)` 时 PostgREST 分不清该走哪个外键，
 * 会直接报错（PGRST201: more than one relationship was found），必须显式
 * 用 `profiles!reports_reporter_id_fkey(display_name)` 指定走哪一个——
 * 这个坑在真实浏览器验证时才会暴露（vitest 里 Supabase 客户端是 mock 的，
 * 不会真的触发 PostgREST 的关系消歧逻辑）。
 */
export async function listReportsForModeration(
  status: string = "pending"
): Promise<AdminReportListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("reports")
    .select(
      "id, reason_code, created_at, target_type, target_id, reporter:profiles!reports_reporter_id_fkey(display_name)"
    )
    .eq("status", status)
    .order("created_at", { ascending: true })
    .overrideTypes<AdminReportRow[]>();

  if (error) {
    throw new AppError(error.message, "ADMIN_REPORTS_LIST_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    reasonCode: row.reason_code,
    createdAt: row.created_at,
    targetType: row.target_type,
    targetId: row.target_id,
    reporterName: row.reporter?.display_name ?? "未知用户"
  }));
}
