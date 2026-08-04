export interface EditProfileFormInput {
  displayName: string;
}

export interface EditProfileFormData {
  displayName: string;
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

function fail(code: string, message: string): EditProfileValidationResult {
  return { success: false, data: null, error: { code, message } };
}

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

  return { success: true, data: { displayName }, error: null };
}
