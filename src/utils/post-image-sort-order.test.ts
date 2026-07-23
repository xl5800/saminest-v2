import { describe, expect, it } from "vitest";

import { getNextPostImageSortOrder } from "./post-image-sort-order";

describe("getNextPostImageSortOrder", () => {
  it("starts a fresh post (no images at all) from 0", () => {
    expect(getNextPostImageSortOrder([])).toBe(0);
  });

  it("reuses sort_order 0 after the only image (which held sort_order 0) is soft-deleted", () => {
    // 对应用户给出的测试用例 1：软删除 sort_order=0 后重新上传，新图
    // 可以正常使用 0。软删除之后，调用方已经把这一张从 existingImages
    // 里过滤掉了——传进来的是"删除之后还剩下的活跃图片"，这里就是
    // "删光了，一张活跃图片都没有"，下一张应该正常从 0 开始，不会因为
    // "sort_order=0 这个值以前被用过"就被拦住（数据库那条唯一索引只挡
    // deleted_at is null 的活跃行，被软删除的行不算数）。
    expect(getNextPostImageSortOrder([])).toBe(0);
  });

  it("continues from the next number after soft-deleting sort_order 0-5, without colliding with anything", () => {
    // 假设 0-5 都被软删除了，只剩 sort_order=6 这一张还活跃。
    const activeImages = [{ sortOrder: 6 }];
    expect(getNextPostImageSortOrder(activeImages)).toBe(7);
  });

  it("starts from max(active sort_order) + 1 when active images have gaps (0, 2, 5)", () => {
    const activeImages = [{ sortOrder: 0 }, { sortOrder: 2 }, { sortOrder: 5 }];
    expect(getNextPostImageSortOrder(activeImages)).toBe(6);
  });

  it("does not depend on array order", () => {
    const activeImages = [{ sortOrder: 5 }, { sortOrder: 0 }, { sortOrder: 2 }];
    expect(getNextPostImageSortOrder(activeImages)).toBe(6);
  });
});
