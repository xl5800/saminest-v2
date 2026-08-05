export const COMMENT_CONTENT_MAX_LENGTH = 500;

export interface CommentContentValidationError {
  code: string;
  message: string;
}

export type CommentContentValidationResult =
  | { success: true; content: string; error: null }
  | { success: false; content: null; error: CommentContentValidationError };

/**
 * comment-section.tsx（顶层发表评论）和 comment-item.tsx（行内回复框）
 * 共用同一份校验——trim 后非空、不超过 500 字，跟 comments 表
 * comments_content_length_check 这条数据库约束（1-500 字）保持一致，
 * 在提交前挡住，不指望数据库报错兜底。两处输入框长得不一样、位置不同，
 * 但校验规则是同一条业务规则，不写两份。
 */
export function validateCommentContent(raw: string): CommentContentValidationResult {
  const content = raw.trim();

  if (!content) {
    return {
      success: false,
      content: null,
      error: { code: "COMMENT_CONTENT_REQUIRED", message: "请输入评论内容。" }
    };
  }
  if (content.length > COMMENT_CONTENT_MAX_LENGTH) {
    return {
      success: false,
      content: null,
      error: {
        code: "COMMENT_CONTENT_TOO_LONG",
        message: `评论内容不能超过 ${COMMENT_CONTENT_MAX_LENGTH} 字。`
      }
    };
  }

  return { success: true, content, error: null };
}
