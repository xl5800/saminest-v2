import { describe, expect, it } from "vitest";

import { formatSalary, isSalaryUnit, salaryUnitChoicesFor } from "./job-fields";

// 第二批：薪资单位加"周薪"，发布页只给 时薪 / 周薪 / 月薪。
describe("job salary units", () => {
  it("formats weekly salaries with /周", () => {
    expect(formatSalary(800, null, "week")).toBe("$800/周");
    expect(formatSalary(25, null, "hour")).toBe("$25/时");
    expect(formatSalary(5000, null, "month")).toBe("$5,000/月");
  });

  it("still formats old daily / yearly posts", () => {
    expect(formatSalary(150, null, "day")).toBe("$150/天");
    expect(formatSalary(60000, null, "year")).toBe("$60,000/年");
  });

  it("accepts week as a salary unit", () => {
    expect(isSalaryUnit("week")).toBe(true);
    expect(isSalaryUnit("fortnight")).toBe(false);
  });

  it("offers only 时薪 / 周薪 / 月薪, plus an old post's own unit when editing it", () => {
    expect(salaryUnitChoicesFor("hour").map((option) => option.label)).toEqual(["时薪", "周薪", "月薪"]);
    expect(salaryUnitChoicesFor("year").map((option) => option.label)).toEqual(["时薪", "周薪", "月薪", "年薪"]);
  });
});
