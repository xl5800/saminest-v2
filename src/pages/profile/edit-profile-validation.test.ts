import { describe, expect, it } from "vitest";

import {
  MAX_AGE,
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_AGE,
  validateEditProfileInput
} from "./edit-profile-validation";

const validInput = { displayName: "小明", bio: "", locationId: "", age: "" };

describe("validateEditProfileInput", () => {
  it("accepts a well-formed display name with empty bio/locationId/age, coercing them to null", () => {
    expect(validateEditProfileInput(validInput)).toEqual({
      success: true,
      data: { displayName: "小明", bio: null, locationId: null, age: null },
      error: null
    });
  });

  it("trims leading/trailing whitespace on displayName", () => {
    expect(validateEditProfileInput({ ...validInput, displayName: "  小明  " })).toEqual({
      success: true,
      data: { displayName: "小明", bio: null, locationId: null, age: null },
      error: null
    });
  });

  it("rejects an empty display name", () => {
    expect(validateEditProfileInput({ ...validInput, displayName: "" })).toEqual({
      success: false,
      data: null,
      error: { code: "EDIT_PROFILE_DISPLAY_NAME_REQUIRED", message: "请填写昵称。" }
    });
  });

  it("rejects a whitespace-only display name", () => {
    expect(validateEditProfileInput({ ...validInput, displayName: "   " })).toEqual({
      success: false,
      data: null,
      error: { code: "EDIT_PROFILE_DISPLAY_NAME_REQUIRED", message: "请填写昵称。" }
    });
  });

  it(`rejects a display name longer than ${MAX_DISPLAY_NAME_LENGTH} characters`, () => {
    const tooLong = "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1);

    expect(validateEditProfileInput({ ...validInput, displayName: tooLong })).toEqual({
      success: false,
      data: null,
      error: {
        code: "EDIT_PROFILE_DISPLAY_NAME_TOO_LONG",
        message: `昵称不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字。`
      }
    });
  });

  it(`accepts a display name exactly ${MAX_DISPLAY_NAME_LENGTH} characters long`, () => {
    const exactLength = "a".repeat(MAX_DISPLAY_NAME_LENGTH);

    expect(validateEditProfileInput({ ...validInput, displayName: exactLength })).toEqual({
      success: true,
      data: { displayName: exactLength, bio: null, locationId: null, age: null },
      error: null
    });
  });

  it("counts displayName length after trimming, not before", () => {
    const withPadding = `  ${"a".repeat(MAX_DISPLAY_NAME_LENGTH)}  `;

    expect(validateEditProfileInput({ ...validInput, displayName: withPadding })).toEqual({
      success: true,
      data: { displayName: "a".repeat(MAX_DISPLAY_NAME_LENGTH), bio: null, locationId: null, age: null },
      error: null
    });
  });

  it("accepts and trims a well-formed bio", () => {
    const result = validateEditProfileInput({ ...validInput, bio: "  热爱生活  " });

    expect(result).toEqual({
      success: true,
      data: { displayName: "小明", bio: "热爱生活", locationId: null, age: null },
      error: null
    });
  });

  it(`rejects a bio longer than ${MAX_BIO_LENGTH} characters`, () => {
    const tooLong = "a".repeat(MAX_BIO_LENGTH + 1);

    expect(validateEditProfileInput({ ...validInput, bio: tooLong })).toEqual({
      success: false,
      data: null,
      error: { code: "EDIT_PROFILE_BIO_TOO_LONG", message: `简介不能超过 ${MAX_BIO_LENGTH} 字。` }
    });
  });

  it(`accepts a bio exactly ${MAX_BIO_LENGTH} characters long`, () => {
    const exactLength = "a".repeat(MAX_BIO_LENGTH);

    const result = validateEditProfileInput({ ...validInput, bio: exactLength });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.bio).toBe(exactLength);
  });

  it("treats a whitespace-only bio the same as an empty one (coerced to null)", () => {
    const result = validateEditProfileInput({ ...validInput, bio: "   " });

    expect(result).toEqual({
      success: true,
      data: { displayName: "小明", bio: null, locationId: null, age: null },
      error: null
    });
  });

  it("passes a well-formed locationId through unchanged", () => {
    const result = validateEditProfileInput({ ...validInput, locationId: "loc-1" });

    expect(result).toEqual({
      success: true,
      data: { displayName: "小明", bio: null, locationId: "loc-1", age: null },
      error: null
    });
  });

  // "找搭子详情页改版对齐方案图"任务卡 1：年龄是可选字段，留空（或只有
  // 空白字符）直接通过、不做任何格式/范围检查，跟 bio/locationId 是同一
  // 个"可选字段"待遇。
  describe("age", () => {
    it("treats an empty age as optional, coercing it to null", () => {
      const result = validateEditProfileInput({ ...validInput, age: "" });

      expect(result).toEqual({
        success: true,
        data: { displayName: "小明", bio: null, locationId: null, age: null },
        error: null
      });
    });

    it("treats a whitespace-only age the same as an empty one (coerced to null)", () => {
      const result = validateEditProfileInput({ ...validInput, age: "   " });

      expect(result).toEqual({
        success: true,
        data: { displayName: "小明", bio: null, locationId: null, age: null },
        error: null
      });
    });

    it("accepts a well-formed integer age within range, parsed to a number", () => {
      const result = validateEditProfileInput({ ...validInput, age: "25" });

      expect(result).toEqual({
        success: true,
        data: { displayName: "小明", bio: null, locationId: null, age: 25 },
        error: null
      });
    });

    it(`accepts the boundary value MIN_AGE (${MIN_AGE})`, () => {
      const result = validateEditProfileInput({ ...validInput, age: String(MIN_AGE) });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.age).toBe(MIN_AGE);
    });

    it(`accepts the boundary value MAX_AGE (${MAX_AGE})`, () => {
      const result = validateEditProfileInput({ ...validInput, age: String(MAX_AGE) });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.age).toBe(MAX_AGE);
    });

    it(`rejects an age below MIN_AGE (${MIN_AGE})`, () => {
      const result = validateEditProfileInput({ ...validInput, age: String(MIN_AGE - 1) });

      expect(result).toEqual({
        success: false,
        data: null,
        error: {
          code: "EDIT_PROFILE_AGE_OUT_OF_RANGE",
          message: `年龄必须在 ${MIN_AGE} 到 ${MAX_AGE} 岁之间。`
        }
      });
    });

    it(`rejects an age above MAX_AGE (${MAX_AGE})`, () => {
      const result = validateEditProfileInput({ ...validInput, age: String(MAX_AGE + 1) });

      expect(result).toEqual({
        success: false,
        data: null,
        error: {
          code: "EDIT_PROFILE_AGE_OUT_OF_RANGE",
          message: `年龄必须在 ${MIN_AGE} 到 ${MAX_AGE} 岁之间。`
        }
      });
    });

    it("rejects a non-integer (decimal) age", () => {
      const result = validateEditProfileInput({ ...validInput, age: "25.5" });

      expect(result).toEqual({
        success: false,
        data: null,
        error: { code: "EDIT_PROFILE_AGE_INVALID", message: "年龄必须是整数。" }
      });
    });

    it("rejects a non-numeric age", () => {
      const result = validateEditProfileInput({ ...validInput, age: "abc" });

      expect(result).toEqual({
        success: false,
        data: null,
        error: { code: "EDIT_PROFILE_AGE_INVALID", message: "年龄必须是整数。" }
      });
    });

    it("rejects a negative age (caught by the range check, not treated as valid)", () => {
      const result = validateEditProfileInput({ ...validInput, age: "-5" });

      expect(result).toEqual({
        success: false,
        data: null,
        error: {
          code: "EDIT_PROFILE_AGE_OUT_OF_RANGE",
          message: `年龄必须在 ${MIN_AGE} 到 ${MAX_AGE} 岁之间。`
        }
      });
    });
  });
});
