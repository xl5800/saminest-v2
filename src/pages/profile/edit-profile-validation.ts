export interface EditProfileFormInput {
  displayName: string;
  bio: string;
  locationId: string;
  /** "找搭子详情页改版对齐方案图"任务卡 1：表单原始字符串（数字输入框
   *  的 value 本来就是字符串），空字符串表示用户没填，跟 bio/locationId
   *  是同一个约定。 */
  age: string;
}

export interface EditProfileFormData {
  displayName: string;
  bio: string | null;
  locationId: string | null;
  age: number | null;
}

export interface EditProfileValidationError {
  code: string;
  message: string;
}

export type EditProfileValidationResult =
  | { success: true; data: EditProfileFormData; error: null }
  | { success: false; data: null; error: EditProfileValidationError };

/**
 * 系统里昵称长度目前完全没有上限，长昵称会把个人资料卡片/帖子卡片的
 * 布局撑坏，这里补上限制——只做前端校验，不加数据库 check constraint：
 * 现有数据可能已经有超长昵称，加约束前得先查一遍现有数据，这次不做，
 * 只挡住"以后新产生的"超长昵称。
 */
export const MAX_DISPLAY_NAME_LENGTH = 20;

/**
 * 简介字数上限——直接扩展这个文件而不是仿照 comment-content-validation.ts
 * 另起一个 validate-bio.ts：昵称/简介/城市这三个字段是同一张编辑资料表单
 * 提交时一起校验、一起提交的，拆成多个校验文件反而要在
 * edit-profile-page.tsx 里分别 import/分别调用三次，不如像现在这样一次
 * validateEditProfileInput 调用返回三个字段各自的校验结果，跟这个表单
 * "一次保存三个字段"的实际形状对应；comment-content-validation.ts 之所以
 * 单独拆出来，是因为它同时被两个不同的组件（comment-section.tsx 的顶层
 * 输入框、comment-item.tsx 的行内回复框）各自独立调用，这里没有那种"多处
 * 复用同一条规则"的场景。
 */
export const MAX_BIO_LENGTH = 200;

/**
 * "找搭子详情页改版对齐方案图"任务卡 1：年龄取值范围，必须跟数据库那条
 * profiles_age_check 约束（supabase/migrations/20260903050000_add_profile_age.sql）
 * 保持同一个区间，不能各定一套——不然前端放行的值会在数据库这一层被拒绝，
 * 用户看到的会是一条原始的数据库错误，而不是这里给出的友好提示。这两个
 * 数字本身没有跟产品逐字确认过，是"明显不离谱"的合理区间，不是在编码
 * 具体的产品/法律政策。
 */
export const MIN_AGE = 13;
export const MAX_AGE = 120;

function fail(code: string, message: string): EditProfileValidationResult {
  return { success: false, data: null, error: { code, message } };
}

/**
 * bio/locationId/age 允许为空（不是必填项）——trim 之后是空字符串就统一
 * 转成 null 再返回，调用方（updateMyProfile）直接把这里返回的值原样写库，
 * 不在仓库层再做一次"空字符串转 null"的归一化，两边只应该有一处做这件事。
 *
 * age 校验顺序：先判断是不是留空（留空直接通过，不做任何格式/范围检查，
 * 跟 bio/locationId 是同一个"可选字段"待遇）；填了的话先判断是不是整数
 * （用户在数字输入框里打了 "25.5" 这种非整数、或者根本不是数字的字符串
 * 都应该在这里被挡住，不能带着一个小数/NaN 传到数据库层才被
 * profiles_age_check 拒绝），再判断是否落在 [MIN_AGE, MAX_AGE] 区间内。
 */
export function validateEditProfileInput(
  input: EditProfileFormInput
): EditProfileValidationResult {
  const displayName = input.displayName.trim();

  if (!displayName) {
    return fail("EDIT_PROFILE_DISPLAY_NAME_REQUIRED", "请填写昵称。");
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return fail(
      "EDIT_PROFILE_DISPLAY_NAME_TOO_LONG",
      `昵称不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字。`
    );
  }

  const bio = input.bio.trim();
  if (bio.length > MAX_BIO_LENGTH) {
    return fail("EDIT_PROFILE_BIO_TOO_LONG", `简介不能超过 ${MAX_BIO_LENGTH} 字。`);
  }

  const locationId = input.locationId.trim();

  const ageRaw = input.age.trim();
  let age: number | null = null;
  if (ageRaw) {
    const parsedAge = Number(ageRaw);
    if (!Number.isInteger(parsedAge)) {
      return fail("EDIT_PROFILE_AGE_INVALID", "年龄必须是整数。");
    }
    if (parsedAge < MIN_AGE || parsedAge > MAX_AGE) {
      return fail(
        "EDIT_PROFILE_AGE_OUT_OF_RANGE",
        `年龄必须在 ${MIN_AGE} 到 ${MAX_AGE} 岁之间。`
      );
    }
    age = parsedAge;
  }

  return {
    success: true,
    data: {
      displayName,
      bio: bio ? bio : null,
      locationId: locationId ? locationId : null,
      age
    },
    error: null
  };
}
