import { CONTACT_METHOD_OPTIONS } from "../publish/publish-validation";

// 复用 posts 的 contact_method 逻辑（设计文档 6 节明确列出的复用项，
// activities.contact_method 用的是同一个枚举约束），直接从
// publish-validation.ts 导入这个常量数组，不重新定义一份一样的选项列表。
const CONTACT_METHOD_VALUES: readonly string[] = CONTACT_METHOD_OPTIONS.map(
  (option) => option.value
);

/**
 * 边界值来自 docs/01_Product/FindBuddy-Design.md 第 3.1 节 activities 表：
 * - title 1-120 字符（跟 posts.title 一致）
 * - description 1-2000 字符（比 posts.description 的 1-10000 短，活动
 *   说明不需要那么长）
 * - tag_text 1-20 字符，可选
 * - landmark_text 1-100 字符，可选（跟 posts.location_text 一致）
 * - capacity 大于 0 的整数，可选（null 表示不限）
 * 这里的前端校验必须和这些数据库约束保持一致，不额外发明更严格或更宽松
 * 的规则——跟 publish-validation.ts 顶部的说明是同一个原则。
 */
export const TITLE_MIN_LENGTH = 1;
export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MIN_LENGTH = 1;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const TAG_TEXT_MAX_LENGTH = 20;
export const LANDMARK_TEXT_MAX_LENGTH = 100;

export interface ActivityFormInput {
  channel: string;
  tagText: string;
  title: string;
  description: string;
  locationId: string;
  landmarkText: string;
  isOnline: boolean;
  // <input type="datetime-local"> 的原始字符串（本地时区，无秒/时区信息），
  // 由调用方（create-activity-page.tsx）负责从表单读出来，这里转换成 ISO
  // 字符串再往下传。
  startAt: string;
  capacity: string;
  contactMethod: string;
  contactValue: string;
}

export interface ActivityFormData {
  channel: string;
  tagText: string | null;
  title: string;
  description: string;
  locationId: string | null;
  landmarkText: string | null;
  isOnline: boolean;
  startAt: string;
  capacity: number | null;
  contactMethod: string | null;
  contactValue: string | null;
}

export interface ActivityValidationError {
  code: string;
  message: string;
}

export type ActivityValidationResult =
  | { success: true; data: ActivityFormData; error: null }
  | { success: false; data: null; error: ActivityValidationError };

function fail(code: string, message: string): ActivityValidationResult {
  return { success: false, data: null, error: { code, message } };
}

export function validateActivityInput(input: ActivityFormInput): ActivityValidationResult {
  const channel = input.channel.trim();
  const tagTextRaw = input.tagText.trim();
  const title = input.title.trim();
  const description = input.description.trim();
  const locationIdRaw = input.locationId.trim();
  const landmarkTextRaw = input.landmarkText.trim();
  const capacityRaw = input.capacity.trim();
  const contactMethod = input.contactMethod.trim();
  const contactValue = input.contactValue.trim();

  if (!channel) {
    return fail("ACTIVITY_CHANNEL_REQUIRED", "请选择频道。");
  }

  if (tagTextRaw.length > TAG_TEXT_MAX_LENGTH) {
    return fail("ACTIVITY_TAG_TEXT_LENGTH", `标签不能超过 ${TAG_TEXT_MAX_LENGTH} 字符。`);
  }

  if (title.length < TITLE_MIN_LENGTH) {
    return fail("ACTIVITY_TITLE_REQUIRED", "请输入标题。");
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return fail("ACTIVITY_TITLE_LENGTH", `标题不能超过 ${TITLE_MAX_LENGTH} 字符。`);
  }

  if (description.length < DESCRIPTION_MIN_LENGTH) {
    return fail("ACTIVITY_DESCRIPTION_REQUIRED", "请输入描述。");
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return fail(
      "ACTIVITY_DESCRIPTION_LENGTH",
      `描述不能超过 ${DESCRIPTION_MAX_LENGTH} 字符。`
    );
  }

  // 线下活动（!isOnline）城市必选；线上活动可以跳过，见设计文档 3.1 节
  // "is_online = false 时 location_id 不能为空，应用层校验"——数据库不会
  // 用 check 约束强制这条规则（跟 posts 的 price_amount/price_label 互斥
  // 关系一样不做数据库层强制），这里是唯一挡这条规则的地方。
  if (!input.isOnline && !locationIdRaw) {
    return fail("ACTIVITY_LOCATION_REQUIRED", "线下活动请选择城市。");
  }
  const locationId = locationIdRaw || null;

  if (landmarkTextRaw.length > LANDMARK_TEXT_MAX_LENGTH) {
    return fail(
      "ACTIVITY_LANDMARK_TEXT_LENGTH",
      `地标不能超过 ${LANDMARK_TEXT_MAX_LENGTH} 字符。`
    );
  }
  const landmarkText = landmarkTextRaw || null;

  if (!input.startAt) {
    return fail("ACTIVITY_START_AT_REQUIRED", "请选择开始时间。");
  }
  const startAtDate = new Date(input.startAt);
  if (Number.isNaN(startAtDate.getTime())) {
    return fail("ACTIVITY_START_AT_INVALID", "开始时间格式不正确。");
  }
  // 设计文档没有明确要求这一条，但允许创建一个开始时间在过去的活动没有
  // 意义——activities-repository.ts 的 listActivities 默认只展示
  // start_at >= now() 的活动，一个过去时间的活动发布出来就会立刻从列表
  // 里消失，对发起人是个困惑的体验，这里提前挡住比让它在服务端"发布成功
  // 但看不到"更直接。
  if (startAtDate.getTime() <= Date.now()) {
    return fail("ACTIVITY_START_AT_PAST", "开始时间必须晚于当前时间。");
  }

  let capacity: number | null = null;
  if (capacityRaw) {
    const parsedCapacity = Number(capacityRaw);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      return fail("ACTIVITY_CAPACITY_INVALID", "人数上限必须是大于 0 的整数。");
    }
    capacity = parsedCapacity;
  }

  if (contactMethod && !CONTACT_METHOD_VALUES.includes(contactMethod)) {
    return fail("ACTIVITY_CONTACT_METHOD_INVALID", "联系方式类型不正确。");
  }

  return {
    success: true,
    data: {
      channel,
      tagText: tagTextRaw || null,
      title,
      description,
      locationId,
      landmarkText,
      isOnline: input.isOnline,
      startAt: startAtDate.toISOString(),
      capacity,
      contactMethod: contactMethod || null,
      contactValue: contactValue || null
    },
    error: null
  };
}
