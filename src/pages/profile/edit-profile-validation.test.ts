import { describe, expect, it } from "vitest";

import {
  MAX_BIO_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  validateEditProfileInput
} from "./edit-profile-validation";

const validInput = { displayName: "小明", bio: "", locationId: "" };

describe("validateEditProfileInput", () => {
  it("accepts a well-formed display name with empty bio/locationId, coercing them to null", () => {
    expect(validateEditProfileInput(validInput)).toEqual({
      success: true,
      data: { displayName: "小明", bio: null, locationId: null },
      error: null
    });
  });

  it("trims leading/trailing whitespace on displayName", () => {
    expect(validateEditProfileInput({ ...validInput, displayName: "  小明  " })).toEqual({
      success: true,
      data: { displayName: "小明", bio: null, locationId: null },
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
      data: { displayName: exactLength, bio: null, locationId: null },
      error: null
    });
  });

  it("counts displayName length after trimming, not before", () => {
    const withPadding = `  ${"a".repeat(MAX_DISPLAY_NAME_LENGTH)}  `;

    expect(validateEditProfileInput({ ...validInput, displayName: withPadding })).toEqual({
      success: true,
      data: { displayName: "a".repeat(MAX_DISPLAY_NAME_LENGTH), bio: null, locationId: null },
      error: null
    });
  });

  it("accepts and trims a well-formed bio", () => {
    const result = validateEditProfileInput({ ...validInput, bio: "  热爱生活  " });

    expect(result).toEqual({
      success: true,
      data: { displayName: "小明", bio: "热爱生活", locationId: null },
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
      data: { displayName: "小明", bio: null, locationId: null },
      error: null
    });
  });

  it("passes a well-formed locationId through unchanged", () => {
    const result = validateEditProfileInput({ ...validInput, locationId: "loc-1" });

    expect(result).toEqual({
      success: true,
      data: { displayName: "小明", bio: null, locationId: "loc-1" },
      error: null
    });
  });
});
