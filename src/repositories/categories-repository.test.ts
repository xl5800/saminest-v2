import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, orderMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = orderMock;
  return { queryBuilder: builder, orderMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { listActiveCategories } from "./categories-repository";

describe("listActiveCategories", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    orderMock.mockReset();
  });

  it("only requests active categories ordered by sort_order", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    await listActiveCategories();

    expect(fromMock).toHaveBeenCalledWith("categories");
    expect(queryBuilder.eq).toHaveBeenCalledWith("is_active", true);
    expect(orderMock).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("maps rows to CategoryListItem", async () => {
    orderMock.mockResolvedValue({
      data: [{ id: "cat-1", slug: "rent", name_zh: "租房" }],
      error: null
    });

    const result = await listActiveCategories();

    expect(result).toEqual([{ id: "cat-1", slug: "rent", nameZh: "租房" }]);
  });

  it("returns an empty array without throwing when there are no categories", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    expect(await listActiveCategories()).toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    orderMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActiveCategories()).rejects.toMatchObject({
      code: "CATEGORIES_LIST_FAILED"
    });
  });
});
