import { describe, expect, it } from "vitest";

import { MIN_PASSWORD_LENGTH, validateRegisterInput } from "./register-validation";

function input(overrides: Partial<Parameters<typeof validateRegisterInput>[0]> = {}) {
  return {
    email: "user@example.com",
    password: "password123",
    confirmPassword: "password123",
    displayName: "小明",
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

  it("requires an email", () => {
    expect(validateRegisterInput(input({ email: "" }))).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_EMAIL_REQUIRED", message: "请填写邮箱。" }
    });
  });

  it("rejects a malformed email", () => {
    expect(validateRegisterInput(input({ email: "not-an-email" }))).toEqual({
      success: false,
      data: null,
      error: { code: "REGISTER_EMAIL_INVALID", message: "邮箱格式不正确。" }
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
});
