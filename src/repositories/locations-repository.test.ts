import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, orderMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = orderMock;
  return { queryBuilder: builder, orderMock };
});

// fromMock 的类型显式标成"接收一个表名字符串"（即使这几个既有测试从没直接
// 断言过参数类型），是因为下面 listRegionContentCounts 那个 describe 块
// 需要用 mockImplementation((table) => ...) 按表名分流返回不同的 builder
// ——如果这里仍然用零参数的 `() => queryBuilder` 推断类型，那个
// mockImplementation 调用会报"目标签名参数太少"的类型错误。
const fromMock = vi.fn((_table: string) => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  listActiveActivityRegions,
  listActiveCitiesWithState,
  listActiveLocations,
  listRegionContentCounts
} from "./locations-repository";

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

describe("listActiveCitiesWithState", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    orderMock.mockReset();
  });

  it("only requests active, type = 'city' locations ordered by sort_order, selecting state_code", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    await listActiveCitiesWithState();

    expect(fromMock).toHaveBeenCalledWith("locations");
    expect(queryBuilder.select).toHaveBeenCalledWith("id, name, state_code");
    expect(queryBuilder.eq).toHaveBeenCalledWith("is_active", true);
    expect(queryBuilder.eq).toHaveBeenCalledWith("type", "city");
    expect(orderMock).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("maps rows to LocationWithStateItem, including state_code", async () => {
    orderMock.mockResolvedValue({
      data: [
        { id: "loc-1", name: "Washington, DC", state_code: "DC" },
        { id: "loc-2", name: "Arlington", state_code: "VA" }
      ],
      error: null
    });

    const result = await listActiveCitiesWithState();

    expect(result).toEqual([
      { id: "loc-1", name: "Washington, DC", stateCode: "DC" },
      { id: "loc-2", name: "Arlington", stateCode: "VA" }
    ]);
  });

  it("returns an empty array without throwing when there are no locations", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    expect(await listActiveCitiesWithState()).toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    orderMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listActiveCitiesWithState()).rejects.toMatchObject({
      code: "LOCATIONS_WITH_STATE_LIST_FAILED"
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

  it("only requests active, type = 'state' locations ordered by sort_order, selecting state_code", async () => {
    orderMock.mockResolvedValue({ data: [], error: null });

    await listActiveActivityRegions();

    expect(fromMock).toHaveBeenCalledWith("locations");
    expect(queryBuilder.select).toHaveBeenCalledWith("id, name, state_code");
    expect(queryBuilder.eq).toHaveBeenCalledWith("is_active", true);
    expect(queryBuilder.eq).toHaveBeenCalledWith("type", "state");
    expect(orderMock).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  // 12 号卡：locations 表补全到全美 51 个 type = 'state' 行之后，这里
  // 天然跟着变成 51 条——这个测试不需要真的塞 51 行数据来"验证数量"，
  // 只要确认单行的映射（含新增的 stateCode 字段）是对的就够，数量交给
  // 上面那条"只请求 type = 'state'"的测试断言过滤条件本身。
  it("maps rows to LocationWithStateItem, including state_code", async () => {
    orderMock.mockResolvedValue({
      data: [
        { id: "region-1", name: "DC", state_code: "DC" },
        { id: "region-2", name: "VA", state_code: "VA" },
        { id: "region-3", name: "CA", state_code: "CA" }
      ],
      error: null
    });

    const result = await listActiveActivityRegions();

    expect(result).toEqual([
      { id: "region-1", name: "DC", stateCode: "DC" },
      { id: "region-2", name: "VA", stateCode: "VA" },
      { id: "region-3", name: "CA", stateCode: "CA" }
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

// listRegionContentCounts 查询两张不同的表（posts/activities），每次各自
// 的链式调用形状（select→eq→is / select→in→gte）都跟上面三个测试块共用的
// queryBuilder（select→eq→order 这一种固定形状）不一样，所以这里不复用
// 那个共享 builder，改用一个按表名分流、自己独立构造 builder 的写法——
// fromMock 本身是共享的（vi.mock 只能声明一次），用 mockImplementation
// 按传入的表名返回对应 builder；每个测试结束后在 afterEach 里把 fromMock
// 的实现改回默认的 `() => queryBuilder`，不影响这个文件里其它 describe
// 块（它们只用 mockClear，不会重置 mockImplementation，如果不手动还原，
// 排在这个块之后执行的其它测试会拿到错的 mock 行为）。
describe("listRegionContentCounts", () => {
  function makeBuilder(result: { data: unknown; error: unknown }) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.gte = vi.fn(() => builder);
    builder.overrideTypes = vi.fn().mockResolvedValue(result);
    return builder;
  }

  afterEach(() => {
    fromMock.mockImplementation(() => queryBuilder);
  });

  it("queries both posts (status=approved, not deleted) and activities (status open/full, future) with an inner join on locations", async () => {
    const postsBuilder = makeBuilder({ data: [], error: null });
    const activitiesBuilder = makeBuilder({ data: [], error: null });
    fromMock.mockImplementation((table: string) =>
      table === "posts" ? postsBuilder : activitiesBuilder
    );

    await listRegionContentCounts();

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(postsBuilder.select).toHaveBeenCalledWith("location:locations!inner(state_code)");
    expect(postsBuilder.eq).toHaveBeenCalledWith("status", "approved");
    expect(postsBuilder.is).toHaveBeenCalledWith("deleted_at", null);
    expect(activitiesBuilder.select).toHaveBeenCalledWith("location:locations!inner(state_code)");
    expect(activitiesBuilder.in).toHaveBeenCalledWith("status", ["open", "full"]);
    expect(activitiesBuilder.gte).toHaveBeenCalled();
  });

  it("tallies posts and activities into one combined Map keyed by state_code", async () => {
    const postsBuilder = makeBuilder({
      data: [
        { location: { state_code: "VA" } },
        { location: { state_code: "VA" } },
        { location: { state_code: "DC" } }
      ],
      error: null
    });
    const activitiesBuilder = makeBuilder({
      data: [{ location: { state_code: "VA" } }],
      error: null
    });
    fromMock.mockImplementation((table: string) =>
      table === "posts" ? postsBuilder : activitiesBuilder
    );

    const result = await listRegionContentCounts();

    expect(result).toEqual(
      new Map([
        ["VA", 3],
        ["DC", 1]
      ])
    );
  });

  it("ignores rows with no joined location (state_code missing)", async () => {
    const postsBuilder = makeBuilder({ data: [{ location: null }], error: null });
    const activitiesBuilder = makeBuilder({ data: [], error: null });
    fromMock.mockImplementation((table: string) =>
      table === "posts" ? postsBuilder : activitiesBuilder
    );

    const result = await listRegionContentCounts();

    expect(result.size).toBe(0);
  });

  it("throws an AppError when the posts query fails", async () => {
    const postsBuilder = makeBuilder({
      data: null,
      error: { message: "network down", code: "500" }
    });
    const activitiesBuilder = makeBuilder({ data: [], error: null });
    fromMock.mockImplementation((table: string) =>
      table === "posts" ? postsBuilder : activitiesBuilder
    );

    await expect(listRegionContentCounts()).rejects.toMatchObject({
      code: "REGION_CONTENT_COUNTS_POSTS_FAILED"
    });
  });

  it("throws an AppError when the activities query fails", async () => {
    const postsBuilder = makeBuilder({ data: [], error: null });
    const activitiesBuilder = makeBuilder({
      data: null,
      error: { message: "network down", code: "500" }
    });
    fromMock.mockImplementation((table: string) =>
      table === "posts" ? postsBuilder : activitiesBuilder
    );

    await expect(listRegionContentCounts()).rejects.toMatchObject({
      code: "REGION_CONTENT_COUNTS_ACTIVITIES_FAILED"
    });
  });
});
