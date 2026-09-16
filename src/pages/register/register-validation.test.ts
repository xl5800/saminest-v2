import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH, validateRegisterInput } from "./register-validation";

function input(overrides: Partial<Parameters<typeof validateRegisterInput>[0]> = {}) {
  return {
    email: "user@example.com",
    password: "password123",
    confirmPassword: "password123",
    displayName: "小明",
    agreedToTerms: true,
    ...overrides
  };
}

describe("validateRegisterInput", () => {
  it("accepts a well-formed submission", () => {
    expect(validateRegisterInput(input())).toEqual({
      success: true,
      data: {
        email: "user@example.com",
        password: "password123",
        displayName: "小明"
      },
      error: null
    });
  });

  it("trims email and displayName", () => {
    expect(
      validateRegisterInput(input({ email: "  user@example.com  ", displayName: "  小明  " }))
    ).toEqual({
      success: true,
      data: {
        email: "user@example.com",
        password: "password123",
        displayName: "小明"
      },
      error: null
    });
  });

  it("requires a display name", () => {
    expect(validateRegisterInput(input({ displayName: "  " }))).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_DISPLAY_NAME_REQUIRED", message: "请填写显示名称。" }
    });
  });

  it("requires an email or phone number", () => {
    expect(validateRegisterInput(input({ email: "" }))).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_IDENTIFIER_REQUIRED", message: "请填写邮箱或手机号。" }
    });
  });

  it("rejects a string that looks like neither an email nor a phone number", () => {
    expect(validateRegisterInput(input({ email: "not-an-email" }))).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_IDENTIFIER_INVALID", message: "请输入正确的邮箱或手机号。" }
    });
  });

  // 登录/注册支持手机号任务卡：手机号路径走影子邮箱方案，data.email 是
  // phoneToShadowEmail() 算出来的值，data.phone 是归一化后的真实手机号，
  // register-page.tsx 不需要再判断一次，直接把 data 传给 authService.signUp。
  it("accepts a well-formed 10-digit phone number and derives a shadow email", () => {
    expect(validateRegisterInput(input({ email: "703-555-0199" }))).toEqual({
      success: true,
      data: {
        email: "7035550199@phone.saminest.internal",
        password: "password123",
        displayName: "小明",
        phone: "7035550199"
      },
      error: null
    });
  });

  it("accepts a phone number with a leading +1 country code", () => {
    expect(validateRegisterInput(input({ email: "+1 (703) 555-0199" }))).toEqual({
      success: true,
      data: {
        email: "17035550199@phone.saminest.internal",
        password: "password123",
        displayName: "小明",
        phone: "17035550199"
      },
      error: null
    });
  });

  it("requires a password", () => {
    expect(
      validateRegisterInput(input({ password: "", confirmPassword: "" }))
    ).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_PASSWORD_REQUIRED", message: "请填写密码。" }
    });
  });

  it(`rejects a password shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(
      validateRegisterInput(input({ password: "short1", confirmPassword: "short1" }))
    ).toEqual({
      success: false,
      data: null,
      error: {
        code: "REGISTER_PASSWORD_TOO_SHORT",
        message: `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`
      }
    });
  });

  it("rejects mismatched passwords", () => {
    expect(
      validateRegisterInput(input({ confirmPassword: "different123" }))
    ).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_PASSWORD_MISMATCH", message: "两次输入的密码不一致。" }
    });
  });

  it("requires the terms/privacy checkbox to be checked", () => {
    expect(validateRegisterInput(input({ agreedToTerms: false }))).toEqual({
      success: false,
      data: null,
      error: {
        code: "REGISTER_TERMS_NOT_AGREED",
        message: "请先阅读并同意用户协议和隐私政策。"
      }
    });
  });
});
