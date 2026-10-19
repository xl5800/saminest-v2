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
 * 发布页简化改版（任务卡 7）：发布表单不再有"联系方式"字段——联系方式
 * 固定写站内私信（contact_method = 'message'、contact_value = null）。
 * 标题曾经从描述第一行派生、整段原文存进 description（标题会在正文里重复
 * 一次）；现在改回独立的 title 字段，跟社区发帖页共用"标题 + 正文合在一个
 * 框里"的编辑区（components/title-body-editor.tsx），description 不再包含
 * 标题行。CONTACT_METHOD_OPTIONS 仍然导出：找搭子发布页
 * （create-activity-page.tsx / activity-validation.ts）还在用它。
 */

import {
  type JobFieldsInput,
  isEmploymentType,
  isSalaryUnit,
  normalizeJobPerks
} from "../../features/posts/job-fields";
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
 * 编辑模式回填用：任务卡 7 到"标题/正文分开"改版之间发布的帖子，description
 * 保存的是完整原文，第一行就是 title（派生时 trim 过、可能被截断到
 * TITLE_MAX_LENGTH）。现在标题有了独立输入框，回填正文时如果原样塞回去，
 * 标题会在标题框和正文框里各出现一次，重新提交后正文里还是带着标题行。
 * 所以：正文 trim 后的第一行（trim 后）等于 title 时去掉这一行（连同紧跟
 * 着的空行）；不等于时（更早的历史帖子，title 单独填、不在 description
 * 里）原样返回。
 */
export function stripTitleLineFromDescription(title: string, description: string): string {
  const trimmed = description.trim();
  const [firstLine = "", ...rest] = trimmed.split(/\r?\n/);
  const firstLineTitle = Array.from(firstLine.trim()).slice(0, TITLE_MAX_LENGTH).join("");
  if (!title || firstLineTitle !== title) {
    return description;
  }
  return rest.join("\n").replace(/^\s*\n/, "").trim();
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
  /** 标题输入框原文（标题 + 正文编辑区的第一行）。 */
  title: string;
  /** 正文输入框原文，不含标题。联系方式不是表单输入（固定站内私信）。 */
  description: string;
  price: string;
  /** 31 号卡新增：跟 price 一样是表单原始字符串，"可选、不强制"——非求租
   *  分类下 publish-page.tsx 不会渲染这两个输入框，调用这里时统一传空
   *  字符串，走跟"用户没填"完全相同的校验路径（见下方 validatePublishInput
   *  的处理），不需要一个额外的"是不是求租分类"参数来切换校验逻辑。 */
  posterAge: string;
  posterGender: string;
  /** 招聘求职任务卡新增：只有招聘 / 求职分类传（表单原始值），其它分类不传。
   *  工作帖的薪资数字仍然走上面的 price（不填 = 面议）。 */
  job?: { salaryUnit: string; employmentType: string; perks: string[] } | null;
  /** 发布页 ZIP 定位任务卡：邮编输入框原文（可选）。 */
  zipCode?: string;
  /** 附近的二手任务卡：二手和免费物品必须填邮编（首页按邮编算距离）。 */
  zipCodeRequired?: boolean;
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
  job: JobFieldsInput | null;
  zipCode: string | null;
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
  const title = input.title.trim();
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

  // 数据库 posts_title_length_check 要求 title 1–120 字符，这里提前拦住，
  // 不让空标题提交上去触发约束报错。输入框本身有 maxLength，长度分支只是
  // 兜底。description 的下限已经放宽到 0（见文件顶部说明），正文可以不写。
  if (title.length === 0) {
    return fail("PUBLISH_TITLE_REQUIRED", "请填写标题。");
  }
  if (Array.from(title).length > TITLE_MAX_LENGTH) {
    return fail("PUBLISH_TITLE_LENGTH", `标题不能超过 ${TITLE_MAX_LENGTH} 字符。`);
  }

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return fail(
      "PUBLISH_DESCRIPTION_LENGTH",
      `描述不能超过 ${DESCRIPTION_MAX_LENGTH} 字符。`
    );
  }

  // 招聘求职任务卡：工作帖的 price 是薪资，报错文案跟着改叫"薪资"。
  const priceNoun = input.job ? "薪资" : "价格";
  let priceAmount: number | null = null;
  if (priceRaw) {
    const parsed = Number(priceRaw);
    if (!Number.isFinite(parsed)) {
      return fail("PUBLISH_PRICE_INVALID", `${priceNoun}必须是数字。`);
    }
    if (parsed < 0) {
      return fail("PUBLISH_PRICE_NEGATIVE", `${priceNoun}不能小于 0。`);
    }
    priceAmount = parsed;
  }

  // 招聘求职任务卡：工作类型必选；薪资不填就是面议（不另设"面议"开关）；
  // 填了薪资才需要单位。取值范围跟数据库 check 约束一致，见 job-fields.ts。
  let job: JobFieldsInput | null = null;
  if (input.job) {
    if (!isEmploymentType(input.job.employmentType)) {
      return fail("PUBLISH_EMPLOYMENT_TYPE_REQUIRED", "请选择工作类型。");
    }
    const negotiable = priceAmount === null;
    if (!negotiable && !isSalaryUnit(input.job.salaryUnit)) {
      return fail("PUBLISH_SALARY_UNIT_REQUIRED", "请选择薪资单位。");
    }
    job = {
      salaryUnit: !negotiable && isSalaryUnit(input.job.salaryUnit) ? input.job.salaryUnit : null,
      employmentType: input.job.employmentType,
      perks: normalizeJobPerks(input.job.perks),
      negotiable
    };
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

  // 发布页 ZIP 定位任务卡：邮编可选；填了必须是 5 位数字（跟数据库
  // posts_zip_code_format_check 一致）。附近的二手任务卡：二手和免费物品
  // 必填（zipCodeRequired）。
  const zipCodeRaw = (input.zipCode ?? "").trim();
  if (!zipCodeRaw && input.zipCodeRequired) {
    return fail("PUBLISH_ZIP_CODE_REQUIRED", "请填写邮编（二手和免费物品需要邮编，方便附近的人看到）。");
  }
  if (zipCodeRaw && !/^\d{5}$/.test(zipCodeRaw)) {
    return fail("PUBLISH_ZIP_CODE_INVALID", "邮编要是 5 位数字。");
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
      posterGender: posterGenderRaw || null,
      job,
      zipCode: zipCodeRaw || null
    },
    error: null
  };
}
