/**
 * 边界值和可选值都来自 Tables.md 第 9 章 posts 表：
 * - 9.6 字段验证："title 长度：1–120 字符"、"description 长度：0–10000 字符"、
 *   "price_amount >= 0"（数据库侧对应 posts_title_length_check /
 *   posts_description_length_check 两条约束；下限从 5/10 放宽到 1 是
 *   2026-07-21 的产品决定，见
 *   supabase/migrations/20260721000000_relax_posts_title_description_min_length.sql；
 *   发布页简化改版（任务卡 7）又把 description 下限放宽到 0，见
 *   supabase/migrations/20261004000000_allow_empty_post_description.sql）
 * - 9.5 contact_method 可选值：message / email / phone / wechat / other
 * 这里的前端校验必须和这些约束保持一致，不额外发明更严格或更宽松的规则。
 *
 * 发布页简化改版（任务卡 7）：发布表单不再有独立的"标题"输入框和"联系
 * 方式"字段——title 从描述的第一行派生（见 deriveTitleFromDescription），
 * 联系方式固定写站内私信（contact_method = 'message'、contact_value =
 * null）。CONTACT_METHOD_OPTIONS 仍然导出：找搭子发布页
 * （create-activity-page.tsx / activity-validation.ts）还在用它。
 */

import { MAX_AGE, MIN_AGE } from "../profile/edit-profile-validation";

/**
 * 31 号卡（求租板块改版）：求租分类专属的"性别"单选项，UI 上照抄
 * CONTACT_METHOD_OPTIONS 这种"{value, label}[] as const + 派生出纯字符串
 * 数组做成员校验"的写法，不新起一套选项类型模式。三个取值和顺序跟数据库
 * posts_poster_gender_check 约束（见
 * supabase/migrations/20260908190000_add_posts_wanted_poster_fields.sql）
 * 完全一致。
 */
export const GENDER_OPTIONS = [
  { value: "男", label: "男" },
  { value: "女", label: "女" },
  { value: "不透露", label: "不透露" }
] as const;

export type PosterGender = (typeof GENDER_OPTIONS)[number]["value"];

const GENDER_VALUES: readonly string[] = GENDER_OPTIONS.map((option) => option.value);

export const CONTACT_METHOD_OPTIONS = [
  { value: "message", label: "站内消息" },
  { value: "email", label: "邮箱" },
  { value: "phone", label: "电话" },
  { value: "wechat", label: "微信" },
  { value: "other", label: "其他" }
] as const;

export type ContactMethod = (typeof CONTACT_METHOD_OPTIONS)[number]["value"];

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 10000;

/**
 * 发布页简化改版（任务卡 7）：从描述内容派生 title——取 trim 之后的第一行
 * （按 \n / \r\n 分割），超过 TITLE_MAX_LENGTH 按字符（Unicode 码点，不是
 * UTF-16 单元，避免把 emoji 等代理对从中间截断成非法字符串）截断。先对
 * 整段描述 trim 再取第一行，所以描述开头的空行不会让标题变成空字符串。
 * 整段描述为空（或只有空白）时返回空字符串，由 validatePublishInput 拦住。
 */
export function deriveTitleFromDescription(description: string): string {
  const firstLine = description.trim().split(/\r?\n/)[0] ?? "";
  return Array.from(firstLine.trim()).slice(0, TITLE_MAX_LENGTH).join("");
}

/**
 * 编辑模式回填描述框用：新格式的帖子（任务卡 7 之后发布的）description 保存
 * 的是用户输入的完整原文，第一行本来就等于 title（截断前）；但历史帖子的
 * title 是单独填的、不一定出现在 description 里。如果直接把历史帖子的
 * description 原样塞回描述框，提交时 title 会被重新派生成描述的第一行，
 * 悄悄把原标题替换掉。所以回填时：描述的第一行（派生规则同上）已经等于
 * 原标题就原样回填；否则把标题作为第一行拼在描述前面，这样重新提交后
 * 派生出来的 title 仍然是原标题。
 */
export function composeEditableDescription(title: string, description: string): string {
  if (deriveTitleFromDescription(description) === title) {
    return description;
  }
  return description.trim() ? `${title}\n${description}` : title;
}

// 地区下拉框"其他"选项用的哨兵值，不会和 locations 表里的真实 UUID 冲突。
// 选中这个值时，locationId 提交为 null，locationText 改为必填——见
// supabase/migrations/20260722000400_add_posts_location_text.sql 的说明：
// 这是给"下拉框里没有的地区"提供的兜底手动输入，不是把标准化地区选择
// 整个换成自由文本，locations 表和 location_id 外键完全不受影响。
//
// design_handoff_saminest_ios 第 6 项起，/region-select?mode=form 选中的
// 任何一个州都能在 locations 表里查到对应的 type='state' 行（12 号卡把
// 全美 51 州补全成真实行之后），publish-page.tsx 不会再主动把 locationId
// 设成这个哨兵值——这条分支现在只是给历史遗留数据（那批 locationId 为
// null、只存了 locationText 的老帖子）保留的读/改兼容路径，不是新选择
// 流程的一部分。见下面 validatePublishInput 的处理和 publish-page.tsx
// 消费 pendingRegion 的地方。
export const OTHER_LOCATION_VALUE = "__other__";

// 跟 posts_location_text_length_check 这条数据库约束保持一致。
export const LOCATION_TEXT_MAX_LENGTH = 100;

export interface PublishFormInput {
  categoryId: string;
  locationId: string;
  locationText: string;
  /** 完整的描述原文——title 不再是独立字段，由这里派生（见
   *  deriveTitleFromDescription），联系方式也不再是表单输入（固定站内私信）。 */
  description: string;
  price: string;
  /** 31 号卡新增：跟 price 一样是表单原始字符串，"可选、不强制"——非求租
   *  分类下 publish-page.tsx 不会渲染这两个输入框，调用这里时统一传空
   *  字符串，走跟"用户没填"完全相同的校验路径（见下方 validatePublishInput
   *  的处理），不需要一个额外的"是不是求租分类"参数来切换校验逻辑。 */
  posterAge: string;
  posterGender: string;
}

export interface PublishFormData {
  categoryId: string;
  locationId: string | null;
  locationText: string | null;
  title: string;
  description: string;
  priceAmount: number | null;
  contactMethod: string | null;
  contactValue: string | null;
  posterAge: number | null;
  posterGender: string | null;
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
  const locationIdRaw = input.locationId.trim();
  const locationTextRaw = input.locationText.trim();
  const description = input.description.trim();
  const title = deriveTitleFromDescription(description);
  const priceRaw = input.price.trim();
  const posterAgeRaw = input.posterAge.trim();
  const posterGenderRaw = input.posterGender.trim();

  if (!categoryId) {
    return fail("PUBLISH_CATEGORY_REQUIRED", "请选择分类。");
  }

  // 地区：OTHER_LOCATION_VALUE 这个哨兵值目前只有历史遗留帖子（location_id
  // 为 null、只存了 locationText 的老数据）会命中——选中它时 locationId
  // 提交为 null，locationText 必填，跟改动前完全一样，纯粹是为了不破坏
  // 这批老帖子的编辑路径。
  //
  // design_handoff_saminest_ios 第 6 项：除了这条历史兼容分支，locationId
  // （所在州/城市，真实外键）和 locationText（"城市/具体位置"，可选补充
  // 说明，照抄 activities 的 landmarkText 是独立字段这个先例）不再互斥——
  // 两者可以同时提交，也可以都不填（对应"不限地区"）。
  let locationId: string | null = locationIdRaw || null;
  let locationText: string | null = null;
  if (locationIdRaw === OTHER_LOCATION_VALUE) {
    if (!locationTextRaw) {
      return fail("PUBLISH_LOCATION_TEXT_REQUIRED", "请输入地区名称。");
    }
    if (locationTextRaw.length > LOCATION_TEXT_MAX_LENGTH) {
      return fail(
        "PUBLISH_LOCATION_TEXT_LENGTH",
        `地区名称不能超过 ${LOCATION_TEXT_MAX_LENGTH} 字符。`
      );
    }
    locationId = null;
    locationText = locationTextRaw;
  } else if (locationTextRaw) {
    if (locationTextRaw.length > LOCATION_TEXT_MAX_LENGTH) {
      return fail(
        "PUBLISH_LOCATION_TEXT_LENGTH",
        `具体位置不能超过 ${LOCATION_TEXT_MAX_LENGTH} 字符。`
      );
    }
    locationText = locationTextRaw;
  }

  // title 是从描述第一行派生的（派生时已经截断到 TITLE_MAX_LENGTH，所以不会
  // 再有"标题太长"这种失败），派生结果为空说明整段描述是空的（或者只有
  // 空白）——数据库 posts_title_length_check 要求 title 至少 1 个字符，这里
  // 必须提前拦住，不能让空标题提交上去触发约束报错。description 自己的
  // 下限已经放宽到 0（见文件顶部说明），不需要单独校验下限。
  if (title.length === 0) {
    return fail("PUBLISH_CONTENT_REQUIRED", "请至少写点什么。");
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

  // 31 号卡：性别/年龄"可选、不强制"——留空直接通过，不因为是求租分类就
  // 反过来要求必填（任务卡原话按这个默认写，见完工报告里的说明）。校验
  // 顺序/写法照抄 edit-profile-validation.ts 的 age 处理，区间复用同一对
  // MIN_AGE/MAX_AGE 常量，不在这里各定一套数字。
  let posterAge: number | null = null;
  if (posterAgeRaw) {
    const parsedPosterAge = Number(posterAgeRaw);
    if (!Number.isInteger(parsedPosterAge)) {
      return fail("PUBLISH_POSTER_AGE_INVALID", "年龄必须是整数。");
    }
    if (parsedPosterAge < MIN_AGE || parsedPosterAge > MAX_AGE) {
      return fail(
        "PUBLISH_POSTER_AGE_OUT_OF_RANGE",
        `年龄必须在 ${MIN_AGE} 到 ${MAX_AGE} 岁之间。`
      );
    }
    posterAge = parsedPosterAge;
  }

  if (posterGenderRaw && !GENDER_VALUES.includes(posterGenderRaw)) {
    return fail("PUBLISH_POSTER_GENDER_INVALID", "性别选项不正确。");
  }

  return {
    success: true,
    data: {
      categoryId,
      locationId,
      locationText,
      title,
      description,
      priceAmount,
      // 发布页简化改版（任务卡 7）：联系方式固定站内私信，不再由表单输入。
      contactMethod: "message",
      contactValue: null,
      posterAge,
      posterGender: posterGenderRaw || null
    },
    error: null
  };
}
