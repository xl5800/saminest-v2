export interface RegisterFormInput {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

export interface RegisterFormData {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterValidationError {
  code: string;
  message: string;
}

export type RegisterValidationResult =
  | { success: true; data: RegisterFormData; error: null }
  | { success: false; data: null; error: RegisterValidationError };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 密码最小长度：PRD.md 第四章和 Tables.md 都没有规定具体密码规则，
 * 这里的 8 位是本页面自定的默认值，不是文档要求。
 */
export const MIN_PASSWORD_LENGTH = 8;

function fail(code: string, message: string): RegisterValidationResult {
  return { success: false, data: null, error: { code, message } };
}

export function validateRegisterInput(
  input: RegisterFormInput
): RegisterValidationResult {
  const email = input.email.trim();
  const password = input.password;
  const confirmPassword = input.confirmPassword;
  const displayName = input.displayName.trim();

  if (!displayName) {
    return fail("REGISTER_DISPLAY_NAME_REQUIRED", "请填写显示名称。");
  }
  if (!email) {
    return fail("REGISTER_EMAIL_REQUIRED", "请填写邮箱。");
  }
  if (!EMAIL_PATTERN.test(email)) {
    return fail("REGISTER_EMAIL_INVALID", "邮箱格式不正确。");
  }
  if (!password) {
    return fail("REGISTER_PASSWORD_REQUIRED", "请填写密码。");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(
      "REGISTER_PASSWORD_TOO_SHORT",
      `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`
    );
  }
  if (password !== confirmPassword) {
    return fail("REGISTER_PASSWORD_MISMATCH", "两次输入的密码不一致。");
  }

  return { success: true, data: { email, password, displayName }, error: null };
}
