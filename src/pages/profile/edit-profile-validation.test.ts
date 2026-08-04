import { describe, expect, it } from "vitest";

import {
  MAX_DISPLAY_NAME_LENGTH,
  validateEditProfileInput
} from "./edit-profile-validation";

describe("validateEditProfileInput", () => {
  it("accepts a well-formed display name", () => {
    expect(validateEditProfileInput({ displayName: "小明" })).toEqual({
      success: true,
      data: { displayName: "小明" },
      error: null
    });
  });

  it("trims leading/trailing whitespace", () => {
    expect(validateEditProfileInput({ displayName: "  小明  " })).toEqual({
      success: true,
      data: { displayName: "小明" },
      error: null
    });
  });

  it("rejects an empty display name", () => {
    expect(validateEditProfileInput({ displayName: "" })).toEqual({
      success: false,
      data: null,
      error: { code: "EDIT_PROFILE_DISPLAY_NAME_REQUIRED", message: "请填写昵称。" }
    });
  });

  it("rejects a whitespace-only display name", () => {
    expect(validateEditProfileInput({ displayName: "   " })).toEqual({
      success: false,
      data: null,
      error: { code: "EDIT_PROFILE_DISPLAY_NAME_REQUIRED", message: "请填写昵称。" }
    });
  });

  it(`rejects a display name longer than ${MAX_DISPLAY_NAME_LENGTH} characters`, () => {
    const tooLong = "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1);

    expect(validateEditProfileInput({ displayName: tooLong })).toEqual({
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

    expect(validateEditProfileInput({ displayName: exactLength })).toEqual({
      success: true,
      data: { displayName: exactLength },
      error: null
    });
  });

  it("counts length after trimming, not before", () => {
    const withPadding = `  ${"a".repeat(MAX_DISPLAY_NAME_LENGTH)}  `;

    expect(validateEditProfileInput({ displayName: withPadding })).toEqual({
      success: true,
      data: { displayName: "a".repeat(MAX_DISPLAY_NAME_LENGTH) },
      error: null
    });
  });
});
