import { describe, expect, it } from "vitest";

import {
  buildLoginPath,
  carryRedirect,
  resolveRedirectAfterLogin,
  sanitizeRedirectPath
} from "./auth-redirect";

describe("sanitizeRedirectPath", () => {
  it("accepts in-site paths with query strings", () => {
    expect(sanitizeRedirectPath("/activities/act-1?s=123")).toBe("/activities/act-1?s=123");
  });

  it.each([
    ["empty", ""],
    ["null", null],
    ["absolute URL", "https://evil.com"],
    ["protocol-relative", "//evil.com"],
    ["backslash trick", "/\\evil.com"],
    ["relative path", "activities/1"],
    ["the login page itself", "/login?redirect=/x"],
    ["the register page", "/register"]
  ])("rejects %s", (_label, value) => {
    expect(sanitizeRedirectPath(value)).toBeNull();
  });
});

describe("resolveRedirectAfterLogin", () => {
  it("returns the redirect param when it is safe", () => {
    expect(resolveRedirectAfterLogin(new URLSearchParams("redirect=%2Factivities%2Fact-1"))).toBe(
      "/activities/act-1"
    );
  });

  it("falls back to / when missing or unsafe", () => {
    expect(resolveRedirectAfterLogin(new URLSearchParams())).toBe("/");
    expect(resolveRedirectAfterLogin(new URLSearchParams("redirect=https://evil.com"))).toBe("/");
  });
});

describe("buildLoginPath", () => {
  it("encodes the source path into the redirect param", () => {
    expect(buildLoginPath("/activities/act-1?s=1")).toBe(
      "/login?redirect=%2Factivities%2Fact-1%3Fs%3D1"
    );
  });

  it("returns plain /login when there is nothing useful to come back to", () => {
    expect(buildLoginPath(undefined)).toBe("/login");
    expect(buildLoginPath("/login")).toBe("/login");
    expect(buildLoginPath("/")).toBe("/login");
  });
});

describe("carryRedirect", () => {
  it("passes the current redirect param on to the other auth page", () => {
    expect(carryRedirect("/register", new URLSearchParams("redirect=%2Fpost%2F1"))).toBe(
      "/register?redirect=%2Fpost%2F1"
    );
    expect(carryRedirect("/register", new URLSearchParams())).toBe("/register");
  });
});
