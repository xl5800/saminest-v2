/**
 * 边界值和可选值都来自 Tables.md 第 9 章 posts 表：
 * - 9.6 字段验证："title 长度：1–120 字符"、"description 长度：1–10000 字符"、
 *   "price_amount >= 0"（下限从 5/10 放宽到 1 是 2026-07-21 的产品决定，
 *   数据库侧对应 posts_title_length_check / posts_description_length_check
 *   两条约束，见
 *   supabase/migrations/20260721000000_relax_posts_title_description_min_length.sql；
 *   上限 120 / 10000 未改动）
 * - 9.5 contact_method 可选值：message / email / phone / wechat / other
 * 这里的前端校验必须和这些约束保持一致，不额外发明更严格或更宽松的规则。
 */

export const CONTACT_METHOD_OPTIONS = [
  { value: "message", label: "站内消息" },
  { value: "email", label: "邮箱" },
  { value: "phone", label: "电话" },
  { value: "wechat", label: "微信" },
  { value: "other", label: "其他" }
] as const;

export type ContactMethod = (typeof CONTACT_METHOD_OPTIONS)[number]["value"];

const CONTACT_METHOD_VALUES: readonly string[] = CONTACT_METHOD_OPTIONS.map(
  (option) => option.value
);

export const TITLE_MIN_LENGTH = 1;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MIN_LENGTH = 1;
export const DESCRIPTION_MAX_LENGTH = 10000;

export interface PublishFormInput {
  categoryId: string;
  locationId: string;
  title: string;
  description: string;
  price: string;
  contactMethod: string;
  contactValue: string;
}

export interface PublishFormData {
  categoryId: string;
  locationId: string | null;
  title: string;
  description: string;
  priceAmount: number | null;
  contactMethod: string | null;
  contactValue: string | null;
}

export interface PublishValidationError {
  code: string;
  message: string;
}

export type PublishValidationResult =
  | { success: true; data: PublishFormData; error: null }
  | { success: false; data: null; error: PublishValidationError };

function fail(code: string, message: string): PublishValidationResult {
  return { success: false, data: null, error: { code, message } };
}

export function validatePublishInput(
  input: PublishFormInput
): PublishValidationResult {
  const categoryId = input.categoryId.trim();
  const locationId = input.locationId.trim();
  const title = input.title.trim();
  const description = input.description.trim();
  const priceRaw = input.price.trim();
  const contactMethod = input.contactMethod.trim();
  const contactValue = input.contactValue.trim();

  if (!categoryId) {
    return fail("PUBLISH_CATEGORY_REQUIRED", "请选择分类。");
  }

  // 下限现在是 1（TITLE_MIN_LENGTH/DESCRIPTION_MIN_LENGTH），trim 之后
  // "不满足下限"等价于"整个字符串是空的"，所以下限失败只提示"请输入
  // 标题/描述"，不再报"至少 X 个字符"这种数字提示——数字提示是给"下限
  // 明显大于 1"的场景用的，下限就是 1 的时候报数字反而让人困惑。上限
  // （120 / 10000）没有变，超过上限时仍然需要具体提示。
  if (title.length < TITLE_MIN_LENGTH) {
    return fail("PUBLISH_TITLE_REQUIRED", "请输入标题。");
  }

  if (title.length > TITLE_MAX_LENGTH) {
    return fail("PUBLISH_TITLE_LENGTH", `标题不能超过 ${TITLE_MAX_LENGTH} 字符。`);
  }

  if (description.length < DESCRIPTION_MIN_LENGTH) {
    return fail("PUBLISH_DESCRIPTION_REQUIRED", "请输入描述。");
  }

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return fail(
      "PUBLISH_DESCRIPTION_LENGTH",
      `描述不能超过 ${DESCRIPTION_MAX_LENGTH} 字符。`
    );
  }

  let priceAmount: number | null = null;
  if (priceRaw) {
    const parsed = Number(priceRaw);
    if (!Number.isFinite(parsed)) {
      return fail("PUBLISH_PRICE_INVALID", "价格必须是数字。");
    }
    if (parsed < 0) {
      return fail("PUBLISH_PRICE_NEGATIVE", "价格不能小于 0。");
    }
    priceAmount = parsed;
  }

  if (contactMethod && !CONTACT_METHOD_VALUES.includes(contactMethod)) {
    return fail("PUBLISH_CONTACT_METHOD_INVALID", "联系方式类型不正确。");
  }

  return {
    success: true,
    data: {
      categoryId,
      locationId: locationId || null,
      title,
      description,
      priceAmount,
      contactMethod: contactMethod || null,
      contactValue: contactValue || null
    },
    error: null
  };
}
