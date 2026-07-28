import { isFeedbackType } from "../../repositories/feedback-repository";

/**
 * 边界值来自 feedback 表的 check 约束（见
 * supabase/migrations/20260724000000_create_feedback_tables.sql 的
 * feedback_title_length_check / feedback_content_length_check），前端
 * 校验必须和数据库约束保持一致，不额外发明更严格或更宽松的规则。
 *
 * 反馈类型的可选值判断（isFeedbackType）从 feedback-repository.ts 导入，
 * 不在这里重新声明一份——跟 report-post-page.tsx 直接从
 * reports-repository.ts 导入 REPORT_REASON_OPTIONS 是同一个模式，页面层
 * 依赖仓库层的常量/类型判断是这个项目里已经确立的方向，不是反过来。
 */
export const FEEDBACK_TITLE_MIN_LENGTH = 5;
export const FEEDBACK_TITLE_MAX_LENGTH = 50;
export const FEEDBACK_CONTENT_MIN_LENGTH = 10;
export const FEEDBACK_CONTENT_MAX_LENGTH = 500;

export interface SubmitFeedbackFormInput {
  type: string;
  title: string;
  content: string;
}

export interface SubmitFeedbackFormData {
  type: string;
  title: string;
  content: string;
}

export interface SubmitFeedbackValidationError {
  code: string;
  message: string;
}

export type SubmitFeedbackValidationResult =
  | { success: true; data: SubmitFeedbackFormData; error: null }
  | { success: false; data: null; error: SubmitFeedbackValidationError };

function fail(code: string, message: string): SubmitFeedbackValidationResult {
  return { success: false, data: null, error: { code, message } };
}

export function validateSubmitFeedbackInput(
  input: SubmitFeedbackFormInput
): SubmitFeedbackValidationResult {
  const type = input.type.trim();
  const title = input.title.trim();
  const content = input.content.trim();

  if (!type) {
    return fail("FEEDBACK_TYPE_REQUIRED", "请选择反馈类型。");
  }
  if (!isFeedbackType(type)) {
    return fail("FEEDBACK_TYPE_INVALID", "反馈类型不正确。");
  }

  if (title.length < FEEDBACK_TITLE_MIN_LENGTH || title.length > FEEDBACK_TITLE_MAX_LENGTH) {
    return fail(
      "FEEDBACK_TITLE_LENGTH",
      `标题长度需要在 ${FEEDBACK_TITLE_MIN_LENGTH}-${FEEDBACK_TITLE_MAX_LENGTH} 字符之间。`
    );
  }

  if (
    content.length < FEEDBACK_CONTENT_MIN_LENGTH ||
    content.length > FEEDBACK_CONTENT_MAX_LENGTH
  ) {
    return fail(
      "FEEDBACK_CONTENT_LENGTH",
      `内容长度需要在 ${FEEDBACK_CONTENT_MIN_LENGTH}-${FEEDBACK_CONTENT_MAX_LENGTH} 字符之间。`
    );
  }

  return {
    success: true,
    data: { type, title, content },
    error: null
  };
}
