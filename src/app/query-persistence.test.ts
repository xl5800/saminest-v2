import { describe, expect, it } from "vitest";

import { createPersistOptions, shouldPersistQuery } from "./query-persistence";

function query(queryKey: unknown[], status: "success" | "error" | "pending" = "success") {
  return { queryKey, state: { status } } as never;
}

// 原生感 A 批：冷启动缓存只存公开内容。
describe("shouldPersistQuery", () => {
  it("keeps public lists: posts, categories, communities, activities, regions", () => {
    expect(shouldPersistQuery(query(["posts", { categoryId: "c1" }]))).toBe(true);
    expect(shouldPersistQuery(query(["posts", "nearby", {}]))).toBe(true);
    expect(shouldPersistQuery(query(["categories"]))).toBe(true);
    expect(shouldPersistQuery(query(["communities"]))).toBe(true);
    expect(shouldPersistQuery(query(["activities", {}]))).toBe(true);
    expect(shouldPersistQuery(query(["activity-regions"]))).toBe(true);
  });

  it("never keeps private data: messages, my profile, favorites, admin", () => {
    expect(shouldPersistQuery(query(["conversations", "user-1"]))).toBe(false);
    expect(shouldPersistQuery(query(["my-profile", "user-1"]))).toBe(false);
    expect(shouldPersistQuery(query(["favorites", "user-1"]))).toBe(false);
    expect(shouldPersistQuery(query(["my-posts", "user-1"]))).toBe(false);
    expect(shouldPersistQuery(query(["admin", "reports", "pending"]))).toBe(false);
    expect(shouldPersistQuery(query(["post-view-count", "p1"]))).toBe(false);
  });

  it("does not keep failed or unfinished queries", () => {
    expect(shouldPersistQuery(query(["posts", {}], "error"))).toBe(false);
    expect(shouldPersistQuery(query(["posts", {}], "pending"))).toBe(false);
  });
});

describe("createPersistOptions", () => {
  it("expires the saved cache after 24 hours and per app version", () => {
    const options = createPersistOptions();

    expect(options.maxAge).toBe(24 * 60 * 60 * 1000);
    expect(options.buster).toMatch(/^1-/);
  });
});
