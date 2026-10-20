/**
 * 苹果审核 1.2 整改：数据库的敏感词 / 保留昵称检查（见
 * supabase/migrations/20261020170000_ugc_safety_blocked_terms_and_terms_acceptance.sql）
 * 命中时，Postgres 报错的 message 就是下面这几个关键字。在这里统一换成给用户看的
 * 中文提示和固定的 code，所有仓储层不用各自处理。
 */
const MODERATION_ERRORS: Record<string, { code: string; message: string }> = {
  blocked_term: { code: "CONTENT_BLOCKED_TERM", message: "内容含有不当词语，请修改。" },
  display_name_reserved: { code: "DISPLAY_NAME_RESERVED", message: "这个昵称不能使用，请换一个。" }
};

const MODERATION_CODES = new Set(Object.values(MODERATION_ERRORS).map((entry) => entry.code));

export class AppError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    code: string,
    public readonly cause?: unknown
  ) {
    const moderation = MODERATION_ERRORS[message];
    super(moderation ? moderation.message : message);
    this.name = "AppError";
    this.code = moderation ? moderation.code : code;
  }
}

/** 是敏感词 / 保留昵称被拦下的错误时，返回给用户看的提示；否则返回 null。 */
export function getModerationErrorMessage(error: unknown): string | null {
  return error instanceof AppError && MODERATION_CODES.has(error.code) ? error.message : null;
}
