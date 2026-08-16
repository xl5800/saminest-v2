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

import { listActiveActivityRegions, listActiveLocations } from "./locations-repository";

describe("listActiveLocations", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    orderMock.mockReset();
  });

  it("only requests active, type = 'city' locations ordered by sort_order", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    await listActiveLocations();

    expect(fromMock).toHaveBeenCalledWith("locations");
    expect(queryBuilder.eq).toHaveBeenCalledWith("is_active", true);
    expect(queryBuilder.eq).toHaveBeenCalledWith("type", "city");
    expect(orderMock).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("maps rows to LocationListItem", async () => {
    orderMock.mockResolvedValue({
      data: [{ id: "loc-1", name: "Rockville" }],
      error: null
    });

    const result = await listActiveLocations();

    expect(result).toEqual([{ id: "loc-1", name: "Rockville" }]);
  });

  it("returns an empty array without throwing when there are no locations", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    expect(await listActiveLocations()).toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    orderMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActiveLocations()).rejects.toMatchObject({
      code: "LOCATIONS_LIST_FAILED"
    });
  });
});

describe("listActiveActivityRegions", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    orderMock.mockReset();
  });

  it("only requests active, type = 'state' locations ordered by sort_order", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    await listActiveActivityRegions();

    expect(fromMock).toHaveBeenCalledWith("locations");
    expect(queryBuilder.eq).toHaveBeenCalledWith("is_active", true);
    expect(queryBuilder.eq).toHaveBeenCalledWith("type", "state");
    expect(orderMock).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("maps rows to LocationListItem", async () => {
    orderMock.mockResolvedValue({
      data: [
        { id: "region-1", name: "DC" },
        { id: "region-2", name: "VA" },
        { id: "region-3", name: "MD" }
      ],
      error: null
    });

    const result = await listActiveActivityRegions();

    expect(result).toEqual([
      { id: "region-1", name: "DC" },
      { id: "region-2", name: "VA" },
      { id: "region-3", name: "MD" }
    ]);
  });

  it("returns an empty array without throwing when there are no regions", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    expect(await listActiveActivityRegions()).toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    orderMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActiveActivityRegions()).rejects.toMatchObject({
      code: "ACTIVITY_REGIONS_LIST_FAILED"
    });
  });
});
