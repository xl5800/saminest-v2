import { describe, expect, it } from "vitest";

import {
  formatCityOnly,
  formatLocationDisplayName,
  formatSelectedRegionLabel,
  formatShortRegionLabel,
  formatStateLabel,
  formatStateLabelByCode,
  US_STATES
} from "./us-states";

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

// 14 号卡从 home-page.tsx 挪过来的共享函数——首页顶部胶囊和找搭子列表页
// 顶部胶囊现在都读这一个函数格式化第二行文案。
describe("formatSelectedRegionLabel", () => {
  it("formats as '<城市名>, <州代码>' when a specific city is selected, e.g. 'Arlington, VA'", () => {
    expect(
      formatSelectedRegionLabel({ stateCode: "VA", stateName: "Virginia", cityName: "Arlington" })
    ).toBe("Arlington, VA");
  });

  it("falls back to formatStateLabelByCode's '<缩写> <中文州名>' format when no city is selected", () => {
    expect(
      formatSelectedRegionLabel({ stateCode: "CA", stateName: "California", cityName: null })
    ).toBe("CA 加利福尼亚州");
  });

  it("does not duplicate the state code when cityName already ends with it, e.g. DC's 'Washington, DC'", () => {
    // locations 表里 DC 这条城市记录的 name 列存的就是完整的 "Washington, DC"
    // （不是单纯的 "Washington"），如果无脑拼接会变成 "Washington, DC, DC"。
    expect(
      formatSelectedRegionLabel({
        stateCode: "DC",
        stateName: "District of Columbia",
        cityName: "Washington, DC"
      })
    ).toBe("Washington, DC");
  });
});

describe("formatShortRegionLabel", () => {
  it("shows the Chinese state name without the state code or 州", () => {
    expect(formatShortRegionLabel({ stateCode: "VA", cityName: null })).toBe("弗吉尼亚");
    expect(formatShortRegionLabel({ stateCode: "MD", cityName: null })).toBe("马里兰");
  });

  it("keeps names that don't end in 州 (DC) as they are", () => {
    expect(formatShortRegionLabel({ stateCode: "DC", cityName: null })).toBe("哥伦比亚特区");
  });

  it("shows just the city name when a city is selected", () => {
    expect(formatShortRegionLabel({ stateCode: "VA", cityName: "Woodbridge" })).toBe("Woodbridge");
    expect(formatShortRegionLabel({ stateCode: "DC", cityName: "Washington, DC" })).toBe("Washington");
  });
});

// 首页改版：图片网格卡片上只显示城市。
describe("formatCityOnly", () => {
  it("drops a trailing state code", () => {
    expect(formatCityOnly("Centreville, VA")).toBe("Centreville");
    expect(formatCityOnly("Silver Spring,MD")).toBe("Silver Spring");
  });

  it("keeps text that doesn't end in a real state code, and turns a bare state code into the state name", () => {
    expect(formatCityOnly("Tysons Corner")).toBe("Tysons Corner");
    expect(formatCityOnly("Fairfax, XX")).toBe("Fairfax, XX");
    expect(formatCityOnly("VA")).toBe(formatLocationDisplayName("VA"));
  });
});
