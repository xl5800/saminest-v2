import { describe, expect, it } from "vitest";

import { US_STATES } from "./us-states";

describe("US_STATES", () => {
  it("has exactly 51 entries (50 states + DC)", () => {
    expect(US_STATES).toHaveLength(51);
  });

  it("has no duplicate codes", () => {
    const codes = US_STATES.map((state) => state.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has no duplicate names", () => {
    const names = US_STATES.map((state) => state.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses two-letter uppercase codes", () => {
    for (const state of US_STATES) {
      expect(state.code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("includes DC as 'District of Columbia', not 'Washington, DC' or the bare abbreviation", () => {
    const dc = US_STATES.find((state) => state.code === "DC");
    expect(dc?.name).toBe("District of Columbia");
  });

  // 现有 locations 表里真正有城市数据支撑的 3 个州代码（见
  // use-activity-regions-query.ts），这 51 项必须完整覆盖它们，不能因为
  // 拼写不一致导致 region-select-page.tsx 的下钻/直选判断找不到对应项。
  it("includes the three DMV state codes that already have real city data", () => {
    const codes = new Set(US_STATES.map((state) => state.code));
    expect(codes.has("DC")).toBe(true);
    expect(codes.has("VA")).toBe(true);
    expect(codes.has("MD")).toBe(true);
  });
});
