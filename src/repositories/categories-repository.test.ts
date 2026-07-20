import { beforeEach, describe, expect, it, vi } from "vitest";

// queryBuilder 是一个"可 thenable"的假对象：select/eq/order/insert/update/
// single 全部返回 builder 自身用于链式调用，真正决定 await 结果的是
// resolveMock——跟真实的 supabase-js PostgrestFilterBuilder 一样，链上
// 任意一环都可能是最后被 await 的那一环（listActiveCategories 最后 await
// 的是 order()，updateCategory 最后 await 的是 eq()），用同一个 then 实现
// 覆盖所有调用形状，不用为每个函数单独搭一套 mock。
const { queryBuilder, resolveMock } = vi.hoisted(() => {
  const resolveMock = vi.fn();
  const chainMethods = [
    "select",
    "eq",
    "order",
    "insert",
    "update",
    "single"
  ] as const;
  const builder: Record<string, unknown> = {};
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(resolveMock()).then(resolve, reject);
  return { queryBuilder: builder, resolveMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  createCategory,
  listActiveCategories,
  listAllCategoriesForAdmin,
  updateCategory
} from "./categories-repository";

const CHAIN_METHODS = ["select", "eq", "order", "insert", "update", "single"] as const;

function resetMocks(): void {
  fromMock.mockClear();
  for (const method of CHAIN_METHODS) {
    (queryBuilder[method] as ReturnType<typeof vi.fn>).mockClear();
  }
  resolveMock.mockReset();
}

describe("listActiveCategories", () => {
  beforeEach(resetMocks);

  it("only requests active categories ordered by sort_order", async () => {
    resolveMock.mockResolvedValue({ data: [], error: null });

    await listActiveCategories();

    expect(fromMock).toHaveBeenCalledWith("categories");
    expect(queryBuilder.eq).toHaveBeenCalledWith("is_active", true);
    expect(queryBuilder.order).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("maps rows to CategoryListItem", async () => {
    resolveMock.mockResolvedValue({
      data: [{ id: "cat-1", slug: "rent", name_zh: "租房" }],
      error: null
    });

    const result = await listActiveCategories();

    expect(result).toEqual([{ id: "cat-1", slug: "rent", nameZh: "租房" }]);
  });

  it("returns an empty array without throwing when there are no categories", async () => {
    resolveMock.mockResolvedValue({ data: [], error: null });

    expect(await listActiveCategories()).toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    resolveMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActiveCategories()).rejects.toMatchObject({
      code: "CATEGORIES_LIST_FAILED"
    });
  });
});

describe("listAllCategoriesForAdmin", () => {
  beforeEach(resetMocks);

  it("requests every category (no is_active filter) ordered by sort_order", async () => {
    resolveMock.mockResolvedValue({ data: [], error: null });

    await listAllCategoriesForAdmin();

    expect(fromMock).toHaveBeenCalledWith("categories");
    expect(queryBuilder.eq).not.toHaveBeenCalled();
    expect(queryBuilder.order).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("maps rows to AdminCategoryListItem, including inactive ones", async () => {
    resolveMock.mockResolvedValue({
      data: [
        {
          id: "cat-1",
          slug: "old",
          name_zh: "旧分类",
          name_en: "Old",
          description: "已停用",
          sort_order: 5,
          is_active: false
        }
      ],
      error: null
    });

    const result = await listAllCategoriesForAdmin();

    expect(result).toEqual([
      {
        id: "cat-1",
        slug: "old",
        nameZh: "旧分类",
        nameEn: "Old",
        description: "已停用",
        sortOrder: 5,
        isActive: false
      }
    ]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    resolveMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listAllCategoriesForAdmin()).rejects.toMatchObject({
      code: "ADMIN_CATEGORIES_LIST_FAILED"
    });
  });
});

describe("createCategory", () => {
  beforeEach(resetMocks);

  it("inserts a category row and returns the new id", async () => {
    resolveMock.mockResolvedValue({ data: { id: "cat-1" }, error: null });

    const result = await createCategory({
      slug: "furniture",
      nameZh: "家具",
      nameEn: "Furniture",
      description: null,
      sortOrder: 4
    });

    expect(fromMock).toHaveBeenCalledWith("categories");
    expect(queryBuilder.insert).toHaveBeenCalledWith({
      slug: "furniture",
      name_zh: "家具",
      name_en: "Furniture",
      description: null,
      sort_order: 4
    });
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "cat-1" });
  });

  it("throws a distinct CATEGORY_SLUG_DUPLICATE AppError with a friendly message on a unique-violation", async () => {
    resolveMock.mockResolvedValue({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" }
    });

    await expect(
      createCategory({
        slug: "rent",
        nameZh: "租房",
        nameEn: null,
        description: null,
        sortOrder: 0
      })
    ).rejects.toMatchObject({
      code: "CATEGORY_SLUG_DUPLICATE",
      message: "该 slug 已被使用，请换一个。"
    });
  });

  it("throws a generic AppError for any other insert failure", async () => {
    resolveMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "500" }
    });

    await expect(
      createCategory({
        slug: "furniture",
        nameZh: "家具",
        nameEn: null,
        description: null,
        sortOrder: 0
      })
    ).rejects.toMatchObject({ code: "CATEGORY_CREATE_FAILED" });
  });
});

describe("updateCategory", () => {
  beforeEach(resetMocks);

  it("updates the given fields for a category", async () => {
    resolveMock.mockResolvedValue({ data: null, error: null });

    await updateCategory("cat-1", { nameZh: "家具用品", sortOrder: 6 });

    expect(fromMock).toHaveBeenCalledWith("categories");
    expect(queryBuilder.update).toHaveBeenCalledWith({
      name_zh: "家具用品",
      sort_order: 6
    });
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "cat-1");
  });

  it("toggles is_active using the same update function", async () => {
    resolveMock.mockResolvedValue({ data: null, error: null });

    await updateCategory("cat-1", { isActive: false });

    expect(queryBuilder.update).toHaveBeenCalledWith({ is_active: false });
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "cat-1");
  });

  it("throws a distinct CATEGORY_SLUG_DUPLICATE AppError with a friendly message on a unique-violation", async () => {
    resolveMock.mockResolvedValue({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" }
    });

    await expect(
      updateCategory("cat-1", { slug: "rent" })
    ).rejects.toMatchObject({
      code: "CATEGORY_SLUG_DUPLICATE",
      message: "该 slug 已被使用，请换一个。"
    });
  });

  it("throws a generic AppError for any other update failure", async () => {
    resolveMock.mockResolvedValue({
      data: null,
      error: { message: "update failed", code: "500" }
    });

    await expect(
      updateCategory("cat-1", { nameZh: "家具" })
    ).rejects.toMatchObject({ code: "CATEGORY_UPDATE_FAILED" });
  });
});
