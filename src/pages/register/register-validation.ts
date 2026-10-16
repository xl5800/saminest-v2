import { generateDefaultDisplayName } from "../../utils/default-display-name";
import { isLikelyEmail, isLikelyPhone, normalizePhoneDigits, phoneToShadowEmail } from "../../utils/phone-identity";

export interface RegisterFormInput {
  /** 用户输入的原始邮箱或手机号字符串，未经区分——具体是邮箱还是手机号
   *  由 validateRegisterInput 内部判断，见下面的实现。 */
  email: string;
  password: string;
}

export interface RegisterFormData {
  /** 最终要传给 Supabase 的 email：邮箱注册路径是用户输入原样，手机号
   *  注册路径是 phoneToShadowEmail() 算出来的影子邮箱——调用方（
   *  register-page.tsx）不需要再判断一次，直接把这个值喂给
   *  authService.signUp 即可。 */
  email: string;
  password: string;
  /** 注册登录简化任务卡：注册页不再让用户填昵称，这里自动分配一个
   *  "同城用户 + 4 位数"的默认昵称（见 utils/default-display-name.ts）。 */
  displayName: string;
  /** 手机号注册任务卡新增：归一化后的真实手机号数字，只在手机号注册
   *  路径才有值，邮箱注册路径是 undefined。 */
  phone?: string;
}

export interface RegisterValidationError {
  code: string;
  message: string;
}

export type RegisterValidationResult =
  | { success: true; data: RegisterFormData; error: null }
  | { success: false; data: null; error: RegisterValidationError };

/**
 * 密码最小长度：PRD.md 第四章和 Tables.md 都没有规定具体密码规则，
 * 这里的 8 位是本页面自定的默认值，不是文档要求。
 */
export const MIN_PASSWORD_LENGTH = 8;

function fail(code: string, message: string): RegisterValidationResult {
  return { success: false, data: null, error: { code, message } };
}

/**
 * 注册登录简化任务卡：表单从 5 项减到 2 项——去掉了"显示名称"（改成自动
 * 分配默认昵称，第一次报名/发私信时再提示修改）、"确认密码"（密码框本身
 * 有显示密码的开关，确认密码是多余的一步）和"同意协议"勾选框（改成按钮
 * 下方一行"注册即表示同意…"，见 register-page.tsx）。
 */
export function validateRegisterInput(
  input: RegisterFormInput,
  random: () => number = Math.random
): RegisterValidationResult {
  const identifier = input.email.trim();
  const password = input.password;

  if (!identifier) {
    return fail("REGISTER_IDENTIFIER_REQUIRED", "请填写邮箱或手机号。");
  }

  let email: string;
  let phone: string | undefined;
  if (isLikelyEmail(identifier)) {
    email = identifier;
  } else if (isLikelyPhone(identifier)) {
    phone = normalizePhoneDigits(identifier);
    email = phoneToShadowEmail(phone);
  } else {
    return fail("REGISTER_IDENTIFIER_INVALID", "请输入正确的邮箱或手机号。");
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

  return {
    success: true,
    data: { email, password, displayName: generateDefaultDisplayName(random), phone },
    error: null
  };
}
