import { describe, expect, it } from "vitest";

import {
  isLikelyEmail,
  isLikelyPhone,
  normalizePhoneDigits,
  phoneToShadowEmail
} from "./phone-identity";

describe("normalizePhoneDigits", () => {
  it("strips spaces, parens, dashes and a leading +", () => {
    expect(normalizePhoneDigits("+1 (703) 555-0199")).toBe("17035550199");
  });

  it("leaves a bare 10-digit number unchanged", () => {
    expect(normalizePhoneDigits("7035550199")).toBe("7035550199");
  });
});

describe("isLikelyPhone", () => {
  it("accepts a 10-digit local number", () => {
    expect(isLikelyPhone("703-555-0199")).toBe(true);
  });

  it("accepts an 11-digit number with a leading 1 country code", () => {
    expect(isLikelyPhone("+1 703 555 0199")).toBe(true);
  });

  it("rejects an 11-digit number that does not start with 1", () => {
    expect(isLikelyPhone("27035550199")).toBe(false);
  });

  it("rejects something that is clearly an email", () => {
    expect(isLikelyPhone("user@example.com")).toBe(false);
  });

  it("rejects a too-short number", () => {
    expect(isLikelyPhone("12345")).toBe(false);
  });
});

describe("isLikelyEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isLikelyEmail("user@example.com")).toBe(true);
  });

  it("rejects a bare phone number", () => {
    expect(isLikelyEmail("7035550199")).toBe(false);
  });

  it("rejects a string with no @ or domain", () => {
    expect(isLikelyEmail("not-an-email")).toBe(false);
  });
});

describe("phoneToShadowEmail", () => {
  it("appends the shadow-email domain to the normalized digits", () => {
    expect(phoneToShadowEmail("7035550199")).toBe("7035550199@phone.saminest.internal");
  });
});
