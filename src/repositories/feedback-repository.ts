import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

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
