export interface EditProfileFormInput {
  displayName: string;
  bio: string;
  locationId: string;
}

export interface EditProfileFormData {
  displayName: string;
  bio: string | null;
  locationId: string | null;
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

function fail(code: string, message: string): EditProfileValidationResult {
  return { success: false, data: null, error: { code, message } };
}

/**
 * bio/locationId 允许为空（不是必填项）——trim 之后是空字符串就统一转成
 * null 再返回，调用方（updateMyProfile）直接把这里返回的值原样写库，不
 * 在仓库层再做一次"空字符串转 null"的归一化，两边只应该有一处做这件事。
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

  return {
    success: true,
    data: {
      displayName,
      bio: bio ? bio : null,
      locationId: locationId ? locationId : null
    },
    error: null
  };
}
