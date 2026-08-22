import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";
import { listFeedbackImagesByFeedbackIds } from "./feedback-images-repository";

// Postgres/PostgREST 的 insufficient_privilege 错误码，任何 RLS with check
// 失败都会报这个码——具体为什么这里能把它安全地归因于账号受限，见下面
// createFeedback 里的注释（跟 reports-repository.ts 的 createReport 是
// 同一个推理）。
const RLS_VIOLATION_CODE = "42501";
const ACCOUNT_RESTRICTED_MESSAGE =
  "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。";

/**
 * 反馈类型可选值，对应 feedback 表 type 的 check 约束（迁移文件
 * feedback_type_check），中文文案供表单展示用。
 */
export const FEEDBACK_TYPE_OPTIONS = [
  { value: "bug", label: "问题反馈" },
  { value: "suggestion", label: "功能建议" },
  { value: "complaint", label: "投诉" },
  { value: "other", label: "其他" }
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPE_OPTIONS)[number]["value"];

const FEEDBACK_TYPE_VALUES: readonly string[] = FEEDBACK_TYPE_OPTIONS.map(
  (option) => option.value
);

export function isFeedbackType(value: string): value is FeedbackType {
  return FEEDBACK_TYPE_VALUES.includes(value);
}

export interface CreateFeedbackInput {
  userId: string;
  type: string;
  title: string;
  content: string;
}

export interface CreateFeedbackResult {
  id: string;
}

/**
 * 提交一条反馈。status 不接受调用方传入，数据库列默认值就是 'pending'，
 * 这里的 insert payload 里根本不提这一列——跟 createPost() 把 status
 * 硬编码成 'pending' 不在前端暴露是同一个"不给普通用户任何设置内部状态
 * 字段机会"的原则，只是这里连显式赋值都不需要，交给列默认值即可。
 */
export async function createFeedback(
  input: CreateFeedbackInput
): Promise<CreateFeedbackResult> {
  const payload: TablesInsert<"feedback"> = {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    content: input.content
  };

  const { data, error } = await getSupabaseClient()
    .from("feedback")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    // feedback_insert_own 这条 RLS 策略（见
    // supabase/migrations/20260724000000_create_feedback_tables.sql）的
    // with check 有两个条件：user_id = auth.uid()，以及
    // not is_account_restricted()。42501 是 PostgREST 对"任意 with check
    // 失败"统一返回的错误码，本身分不清是哪个条件失败——但这里的 user_id
    // 只可能来自 input.userId，而 createFeedback 唯一的调用方
    // submit-feedback-page.tsx 只会传当前登录用户自己的 session.user.id，
    // 不接受任意/伪造输入，所以 user_id 这个条件对一个正常工作的客户端
    // 来说永远成立。因此对这个调用点而言，42501 只可能是
    // is_account_restricted() 失败，可以放心地映射成一条专门的、可操作
    // 的提示，而不是把原始的"违反行级安全策略"报给用户。
    if (error.code === RLS_VIOLATION_CODE) {
      throw new AppError(ACCOUNT_RESTRICTED_MESSAGE, "ACCOUNT_RESTRICTED", error);
    }
    throw new AppError(error.message, "FEEDBACK_CREATE_FAILED", error);
  }
  if (!data) {
    throw new AppError("提交反馈后无法读取反馈 ID。", "FEEDBACK_CREATE_ID_MISSING");
  }

  return { id: data.id };
}

export interface AdminFeedbackListItem {
  id: string;
  type: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
  submitterName: string;
  images: { id: string; publicUrl: string }[];
}

interface AdminFeedbackRow {
  id: string;
  type: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
  submitter: { display_name: string } | null;
}

/**
 * 管理员"联系客服"处理队列（/admin/feedback）用，照抄
 * reports-repository.ts 的 listReportsForModeration：status 可选过滤（默认
 * "pending"，跟 feedback_status_check 约束的四个取值一致），按 created_at
 * 升序（最早提交的排最前面，同一个"队列处理"的排序直觉）。
 *
 * feedback 表对 profiles 只有 user_id 这一个外键（不像 reports 表对
 * profiles 有 reporter_id/reviewer_id 两个、必须显式指定走哪一个），理论上
 * `profiles(display_name)` 不加消歧后缀也能过 PostgREST 的关系推断，但这里
 * 仍然显式写 `profiles!feedback_user_id_fkey(display_name)`——跟
 * listReportsForModeration 保持同一个写法习惯，不需要每次新增一个联表查询
 * 都重新判断"这次是不是真的不需要消歧"，写法统一也让以后如果 profiles 真的
 * 多出第二个外键时不需要回头改这一处。约束名 feedback_user_id_fkey 已经在
 * Supabase 里核对过（Postgres 默认外键命名规则 {表}_{列}_fkey，没有另外
 * 显式命名），不是照抄 reports 表猜的。
 *
 * 截图不跟主查询一起嵌套 select（那样每条反馈都要单独带出一份 feedback_images
 * 内嵌数组，字段这次也不需要 storage_path/sort_order 等主查询用不到的
 * 列），改成拿到这一页反馈的 id 列表后，用 listFeedbackImagesByFeedbackIds
 * 批量查一次、按 feedbackId 分组——跟 activity-list-page.tsx 批量查参与者
 * 预览是同一个模式，不对每条反馈单独发一次截图请求。
 */
export async function listFeedbackForAdmin(
  status: string = "pending"
): Promise<AdminFeedbackListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("feedback")
    .select(
      "id, type, title, content, status, created_at, submitter:profiles!feedback_user_id_fkey(display_name)"
    )
    .eq("status", status)
    .order("created_at", { ascending: true })
    .overrideTypes<AdminFeedbackRow[]>();

  if (error) {
    throw new AppError(error.message, "ADMIN_FEEDBACK_LIST_FAILED", error);
  }

  const rows = data ?? [];
  const imagesByFeedback = await listFeedbackImagesByFeedbackIds(rows.map((row) => row.id));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    submitterName: row.submitter?.display_name ?? "未知用户",
    images: imagesByFeedback.get(row.id) ?? []
  }));
}

// set_feedback_status() 内部失败原因只有两种（调用者不是管理员、new_status
// 不在 feedback_status_check 允许的四个取值里），管理员在这个页面上点击
// 现成的状态筛选按钮不可能撞上任何一种（按钮传的状态值都是写死在
// STATUS_FILTER_OPTIONS 里的合法常量，调用这个函数的前提本身就是已经通过了
// RequireAdmin 路由鉴权）——不需要像 joinActivity 那样为每种失败原因单独
// 拆一条可操作的错误提示，一条通用错误码兜底即可。
const SET_FEEDBACK_STATUS_ERROR_MESSAGE = "操作失败，请稍后重试。";

/**
 * 管理员修改一条反馈的处理状态。feedback 表没有 UPDATE 策略（见
 * supabase/migrations/20260724000000_create_feedback_tables.sql 顶部的
 * 权限原则说明），必须走 set_feedback_status() 这个 security definer
 * 函数——内部检查 is_admin()、校验 new_status 合法性，并写一条
 * moderation_actions 审计记录，跟 resolveReport/dismissReport 调用
 * resolve_report()/dismiss_report() 是同一个"敏感的管理员状态变更必须走
 * 数据库函数"原则。
 */
export async function setFeedbackStatus(feedbackId: string, newStatus: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("set_feedback_status", {
    target_feedback_id: feedbackId,
    new_status: newStatus
  });

  if (error) {
    throw new AppError(SET_FEEDBACK_STATUS_ERROR_MESSAGE, "ADMIN_SET_FEEDBACK_STATUS_FAILED", error);
  }
}
