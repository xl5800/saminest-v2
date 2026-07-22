import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatListingDate, formatPrice, formatPublishedAt } from "./format";

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

describe("formatListingDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats an ISO timestamp from the current UTC year as MM-DD", () => {
    expect(formatListingDate("2026-07-01T12:00:00.000Z")).toBe("07-01");
  });

  it("formats an ISO timestamp from another UTC year as YYYY-MM-DD", () => {
    expect(formatListingDate("2025-12-31T12:00:00.000Z")).toBe("2025-12-31");
  });

  it("returns the fallback for null", () => {
    expect(formatListingDate(null)).toBe("时间未知");
  });

  it("returns the fallback for an empty string", () => {
    expect(formatListingDate("")).toBe("时间未知");
  });

  it("returns the fallback for an invalid timestamp", () => {
    expect(formatListingDate("not-a-date")).toBe("时间未知");
  });

  it("keeps the database UTC date near UTC midnight", () => {
    expect(formatListingDate("2026-07-01T00:30:00.000Z")).toBe("07-01");
  });
});
