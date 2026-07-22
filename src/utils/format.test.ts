import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatListingDate,
  formatMessageTimeDivider,
  formatPrice,
  formatPublishedAt,
  shouldShowMessageTimeDivider
} from "./format";

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

describe("shouldShowMessageTimeDivider", () => {
  it("shows a divider for the first message in a conversation", () => {
    expect(shouldShowMessageTimeDivider("2026-07-20T12:00:00.000Z", null)).toBe(true);
  });

  it("does not show a divider for consecutive messages within 5 minutes on the same day", () => {
    expect(
      shouldShowMessageTimeDivider("2026-07-20T12:04:00.000Z", "2026-07-20T12:00:00.000Z")
    ).toBe(false);
  });

  it("shows a divider once the gap exceeds 5 minutes", () => {
    expect(
      shouldShowMessageTimeDivider("2026-07-20T12:05:01.000Z", "2026-07-20T12:00:00.000Z")
    ).toBe(true);
  });

  it("shows a divider when the message crosses into a new local day even if the gap is small", () => {
    // 本地时区午夜前后各 1 分钟：即使间隔很短，只要跨过本地日历日就应显示分隔线。
    const localMidnight = new Date(2026, 6, 21, 0, 0, 0, 0);
    const justBeforeMidnight = new Date(localMidnight.getTime() - 60 * 1000).toISOString();
    const justAfterMidnight = new Date(localMidnight.getTime() + 60 * 1000).toISOString();

    expect(shouldShowMessageTimeDivider(justAfterMidnight, justBeforeMidnight)).toBe(true);
  });

  it("treats an invalid previous timestamp as if there were no previous message", () => {
    expect(shouldShowMessageTimeDivider("2026-07-20T12:00:00.000Z", "not-a-date")).toBe(true);
  });
});

describe("formatMessageTimeDivider", () => {
  const now = new Date("2026-07-20T18:00:00.000Z");

  function expectedTimeLabel(date: Date): string {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  it("shows only the time for a message sent today", () => {
    const today = new Date("2026-07-20T12:34:00.000Z");
    expect(formatMessageTimeDivider(today.toISOString(), now)).toBe(expectedTimeLabel(today));
  });

  it("prefixes yesterday's messages with 昨天", () => {
    const yesterday = new Date("2026-07-19T12:34:00.000Z");
    expect(formatMessageTimeDivider(yesterday.toISOString(), now)).toBe(
      `昨天 ${expectedTimeLabel(yesterday)}`
    );
  });

  it("shows the full date for messages older than yesterday", () => {
    const older = new Date("2026-07-01T12:34:00.000Z");
    expect(formatMessageTimeDivider(older.toISOString(), now)).toBe(
      `2026-07-01 ${expectedTimeLabel(older)}`
    );
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(formatMessageTimeDivider("not-a-date", now)).toBe("");
  });
});
