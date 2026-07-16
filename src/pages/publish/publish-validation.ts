/**
 * 边界值和可选值都来自 Tables.md 第 9 章 posts 表：
 * - 9.6 字段验证："title 长度：5–120 字符"、"description 长度：10–10000 字符"、
 *   "price_amount >= 0"
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

export const TITLE_MIN_LENGTH = 5;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MIN_LENGTH = 10;
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

  if (title.length < TITLE_MIN_LENGTH || title.length > TITLE_MAX_LENGTH) {
    return fail(
      "PUBLISH_TITLE_LENGTH",
      `标题长度需要在 ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} 字符之间。`
    );
  }

  if (
    description.length < DESCRIPTION_MIN_LENGTH ||
    description.length > DESCRIPTION_MAX_LENGTH
  ) {
    return fail(
      "PUBLISH_DESCRIPTION_LENGTH",
      `描述长度需要在 ${DESCRIPTION_MIN_LENGTH}-${DESCRIPTION_MAX_LENGTH} 字符之间。`
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
