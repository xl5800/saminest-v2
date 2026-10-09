import { describe, expect, it } from "vitest";

import { getCommunityAbbreviation } from "./community-abbreviation";

describe("getCommunityAbbreviation", () => {
  it("uppercases a plain slug", () => {
    expect(getCommunityAbbreviation("dmv")).toBe("DMV");
  });

  it("only uses the first '-' segment, so multi-part slugs still fit the square avatar", () => {
    expect(getCommunityAbbreviation("dmv-pets")).toBe("DMV");
    expect(getCommunityAbbreviation("dmv-students")).toBe("DMV");
  });

  it("caps very long segments", () => {
    expect(getCommunityAbbreviation("washington")).toBe("WASH");
  });
});
