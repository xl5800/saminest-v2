import { describe, expect, it } from "vitest";

import { formatStateLabel, formatStateLabelByCode, US_STATES } from "./us-states";

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

  // 12 号卡：51 项都要补上中文州名字段，不缺失、不重复——同一个中文名
  // 被误填给两个州是比缺失更隐蔽的错误（两处 UI 都会显示，肉眼一时看不
  // 出来是哪个重了），所以跟英文名一样单独检查不重复。
  it("has a non-empty nameZh for every entry", () => {
    for (const state of US_STATES) {
      expect(state.nameZh.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate nameZh values", () => {
    const namesZh = US_STATES.map((state) => state.nameZh);
    expect(new Set(namesZh).size).toBe(namesZh.length);
  });

  it("every nameZh ends with 州, except DC which ends with 特区", () => {
    for (const state of US_STATES) {
      if (state.code === "DC") {
        expect(state.nameZh).toBe("哥伦比亚特区");
      } else {
        expect(state.nameZh.endsWith("州")).toBe(true);
      }
    }
  });
});

describe("formatStateLabel", () => {
  it("formats as '<缩写> <中文州名>', e.g. 'NY 纽约州'", () => {
    const ny = US_STATES.find((state) => state.code === "NY");
    expect(ny).toBeDefined();
    expect(formatStateLabel(ny!)).toBe("NY 纽约州");
  });

  it("formats DC as 'DC 哥伦比亚特区'", () => {
    const dc = US_STATES.find((state) => state.code === "DC");
    expect(dc).toBeDefined();
    expect(formatStateLabel(dc!)).toBe("DC 哥伦比亚特区");
  });
});

describe("formatStateLabelByCode", () => {
  it("looks up by code and formats the same way as formatStateLabel", () => {
    expect(formatStateLabelByCode("VA")).toBe("VA 弗吉尼亚州");
  });

  it("falls back to the raw code when it does not match any known state", () => {
    expect(formatStateLabelByCode("ZZ")).toBe("ZZ");
  });
});
