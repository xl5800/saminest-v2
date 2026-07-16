import { describe, expect, it } from "vitest";

import { formatPrice, formatPublishedAt } from "./format";

describe("formatPrice", () => {
  it("prefers the price label when present", () => {
    expect(formatPrice(1200, "面议", "USD")).toBe("面议");
  });

  it("formats the amount with the currency code when there is no label", () => {
    expect(formatPrice(1200, null, "USD")).toBe("USD 1,200");
  });

  it("falls back to a placeholder when both amount and label are missing", () => {
    expect(formatPrice(null, null, "USD")).toBe("价格未填写");
  });
});

describe("formatPublishedAt", () => {
  it("formats an ISO timestamp as a localized date", () => {
    expect(formatPublishedAt("2026-07-01T00:00:00.000Z")).toBe(
      new Date("2026-07-01T00:00:00.000Z").toLocaleDateString("zh-CN")
    );
  });

  it("falls back to a placeholder when there is no published date", () => {
    expect(formatPublishedAt(null)).toBe("发布时间未知");
  });
});
