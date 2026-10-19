import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 功能开关（config/feature-flags.ts）：这个文件的用例测的是功能打开时的行为，
// 默认都按"打开"跑；个别用例把开关改成 false 测关闭时的样子。
const featureFlags = vi.hoisted(() => ({ USER_PROFILE_PAGE_ENABLED: true, PHONE_REGISTRATION_ENABLED: true }));
vi.mock("../../config/feature-flags", () => ({
  get USER_PROFILE_PAGE_ENABLED() {
    return featureFlags.USER_PROFILE_PAGE_ENABLED;
  },
  get PHONE_REGISTRATION_ENABLED() {
    return featureFlags.PHONE_REGISTRATION_ENABLED;
  }
}));

import { MIN_PASSWORD_LENGTH, validateRegisterInput } from "./register-validation";

type Input = Parameters<typeof validateRegisterInput>[0];

// 注册登录简化任务卡：表单只剩"邮箱或手机号 + 密码"两项，昵称自动分配。
// random 固定成 0.1234，默认昵称就是确定的"同城用户1234"。
const fixedRandom = () => 0.1234;

function run(overrides: Partial<Input> = {}) {
  return validateRegisterInput(
    { email: "user@example.com", password: "password123", ...overrides },
    fixedRandom
  );
}

describe("validateRegisterInput", () => {
  it("accepts a well-formed submission and assigns a default nickname", () => {
    expect(run()).toEqual({
      success: true,
      data: {
        email: "user@example.com",
        password: "password123",
        displayName: "同城用户1234"
      },
      error: null
    });
  });

  it("trims the email", () => {
    expect(run({ email: "  user@example.com  " })).toEqual({
      success: true,
      data: {
        email: "user@example.com",
        password: "password123",
        displayName: "同城用户1234"
      },
      error: null
    });
  });

  it("generates a 同城用户 + 4 digits nickname with the real random source", () => {
    const result = validateRegisterInput({ email: "user@example.com", password: "password123" });
    expect(result.success && /^同城用户\d{4}$/.test(result.data.displayName)).toBe(true);
  });

  it("requires an email or phone number", () => {
    expect(run({ email: "" })).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_IDENTIFIER_REQUIRED", message: "请填写邮箱或手机号。" }
    });
  });

  describe("手机号注册关闭时（PHONE_REGISTRATION_ENABLED = false）", () => {
    beforeEach(() => {
      featureFlags.PHONE_REGISTRATION_ENABLED = false;
    });
    afterEach(() => {
      featureFlags.PHONE_REGISTRATION_ENABLED = true;
    });

    it("rejects a phone number and asks for an email", () => {
      expect(run({ email: "703-555-0199" })).toEqual({
        success: false,
        data: null,
        error: { code: "REGISTER_IDENTIFIER_INVALID", message: "请输入正确的邮箱地址。" }
      });
    });

    it("asks for an email when the field is empty", () => {
      expect(run({ email: "" }).error?.message).toBe("请填写邮箱。");
    });
  });

  it("rejects a string that looks like neither an email nor a phone number", () => {
    expect(run({ email: "not-an-email" })).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_IDENTIFIER_INVALID", message: "请输入正确的邮箱或手机号。" }
    });
  });

  // 登录/注册支持手机号任务卡：手机号路径走影子邮箱方案，data.email 是
  // phoneToShadowEmail() 算出来的值，data.phone 是归一化后的真实手机号，
  // register-page.tsx 不需要再判断一次，直接把 data 传给 authService.signUp。
  it("accepts a well-formed 10-digit phone number and derives a shadow email", () => {
    expect(run({ email: "703-555-0199" })).toEqual({
      success: true,
      data: {
        email: "7035550199@phone.saminest.internal",
        password: "password123",
        displayName: "同城用户1234",
        phone: "7035550199"
      },
      error: null
    });
  });

  it("accepts a phone number with a leading +1 country code", () => {
    expect(run({ email: "+1 (703) 555-0199" })).toEqual({
      success: true,
      data: {
        email: "17035550199@phone.saminest.internal",
        password: "password123",
        displayName: "同城用户1234",
        phone: "17035550199"
      },
      error: null
    });
  });

  it("requires a password", () => {
    expect(run({ password: "" })).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_PASSWORD_REQUIRED", message: "请填写密码。" }
    });
  });

  it(`rejects a password shorter than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(run({ password: "short1" })).toEqual({
      success: false,
      data: null,
      error: {
        code: "REGISTER_PASSWORD_TOO_SHORT",
        message: `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`
      }
    });
  });
});
