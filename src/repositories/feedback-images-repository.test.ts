import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, selectMock, listQueryBuilder, orderMock, overrideTypesMock, fromMock } =
  vi.hoisted(() => {
    const selectMock = vi.fn();
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    builder.insert = vi.fn(() => builder);
    builder.select = selectMock;

    // listFeedbackImagesByFeedbackIds 走一条不同的链式调用（select -> in ->
    // order -> overrideTypes），跟上面 insertFeedbackImages 的
    // insert -> select 链形状不一样，两个函数还查的是同一张表，没法按表名
    // 分流，用独立的 builder + 各自 describe 块里临时切换 fromMock 的
    // mockImplementation，不跟上面那个 builder 混在一起（见下面
    // listFeedbackImagesByFeedbackIds 那个 describe 块的 beforeEach/afterEach）。
    // order 本身要继续链式返回 builder（不是终点），真正被 await 的是
    // overrideTypes 这一步——跟 activities-repository.test.ts 的
    // overrideTypesMock 是同一个处理方式。
    const orderMock = vi.fn();
    const overrideTypesMock = vi.fn();
    const listQueryBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
    listQueryBuilder.select = vi.fn(() => listQueryBuilder);
    listQueryBuilder.in = vi.fn(() => listQueryBuilder);
    orderMock.mockImplementation(() => listQueryBuilder);
    listQueryBuilder.order = orderMock;
    listQueryBuilder.overrideTypes = overrideTypesMock;

    const fromMock = vi.fn(() => builder);

    return {
      queryBuilder: builder,
      selectMock,
      listQueryBuilder,
      orderMock,
      overrideTypesMock,
      fromMock
    };
  });

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import {
  insertFeedbackImages,
  listFeedbackImagesByFeedbackIds
} from "./feedback-images-repository";

describe("insertFeedbackImages", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.insert.mockClear();
    selectMock.mockReset();
  });

  it("returns an empty array without calling Supabase when there is nothing to insert", async () => {
    const result = await insertFeedbackImages([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("inserts every row in a single batched insert call (no alt_text column, unlike post_images)", async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          id: "img-1",
          feedback_id: "feedback-1",
          storage_path: "user-1/feedback-1/img-1.webp",
          public_url: null,
          sort_order: 0
        }
      ],
      error: null
    });

    const result = await insertFeedbackImages([
      {
        feedbackId: "feedback-1",
        ownerId: "user-1",
        storagePath: "user-1/feedback-1/img-1.webp",
        publicUrl: null,
        width: null,
        height: null,
        sizeBytes: 1024,
        mimeType: "image/webp",
        sortOrder: 0
      }
    ]);

    expect(fromMock).toHaveBeenCalledWith("feedback_images");
    expect(queryBuilder.insert).toHaveBeenCalledWith([
      {
        feedback_id: "feedback-1",
        owner_id: "user-1",
        storage_path: "user-1/feedback-1/img-1.webp",
        public_url: null,
        width: null,
        height: null,
        size_bytes: 1024,
        mime_type: "image/webp",
        sort_order: 0
      }
    ]);
    expect(result).toEqual([
      {
        id: "img-1",
        feedbackId: "feedback-1",
        storagePath: "user-1/feedback-1/img-1.webp",
        publicUrl: null,
        sortOrder: 0
      }
    ]);
  });

  it("throws an AppError when the insert fails", async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "23505" }
    });

    await expect(
      insertFeedbackImages([
        {
          feedbackId: "feedback-1",
          ownerId: "user-1",
          storagePath: "user-1/feedback-1/img-1.webp",
          publicUrl: null,
          width: null,
          height: null,
          sizeBytes: 1024,
          mimeType: "image/webp",
          sortOrder: 0
        }
      ])
    ).rejects.toMatchObject({ code: "FEEDBACK_IMAGES_INSERT_FAILED" });
  });

  it("returns an empty array when the insert succeeds but no rows come back", async () => {
    selectMock.mockResolvedValue({ data: null, error: null });

    const result = await insertFeedbackImages([
      {
        feedbackId: "feedback-1",
        ownerId: "user-1",
        storagePath: "user-1/feedback-1/img-1.webp",
        publicUrl: null,
        width: null,
        height: null,
        sizeBytes: 1024,
        mimeType: "image/webp",
        sortOrder: 0
      }
    ]);

    expect(result).toEqual([]);
  });
});

describe("listFeedbackImagesByFeedbackIds", () => {
  beforeEach(() => {
    fromMock.mockClear();
    fromMock.mockImplementation(() => listQueryBuilder);
    listQueryBuilder.select.mockClear();
    listQueryBuilder.in.mockClear();
    // 用 mockClear 而不是 mockReset——后者会把 vi.hoisted 里设好的
    // `() => listQueryBuilder` 链式返回值也清掉，order 就不再可链式调用了。
    orderMock.mockClear();
    overrideTypesMock.mockReset();
  });

  afterEach(() => {
    // 还原成 insertFeedbackImages 那组测试用的默认 builder，不影响排在这个
    // describe 块之后运行的其它测试。
    fromMock.mockImplementation(() => queryBuilder);
  });

  it("returns an empty Map without calling Supabase when there are no feedback ids", async () => {
    const result = await listFeedbackImagesByFeedbackIds([]);

    expect(result.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("queries feedback_images filtered by feedback_id in(...), ordered by sort_order", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listFeedbackImagesByFeedbackIds(["feedback-1", "feedback-2"]);

    expect(fromMock).toHaveBeenCalledWith("feedback_images");
    expect(listQueryBuilder.select).toHaveBeenCalledWith("id, feedback_id, public_url");
    expect(listQueryBuilder.in).toHaveBeenCalledWith("feedback_id", ["feedback-1", "feedback-2"]);
    expect(orderMock).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("groups images by feedback_id into a Map", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        { id: "img-1", feedback_id: "feedback-1", public_url: "https://example.com/1.webp" },
        { id: "img-2", feedback_id: "feedback-1", public_url: "https://example.com/2.webp" },
        { id: "img-3", feedback_id: "feedback-2", public_url: "https://example.com/3.webp" }
      ],
      error: null
    });

    const result = await listFeedbackImagesByFeedbackIds(["feedback-1", "feedback-2"]);

    expect(result.get("feedback-1")).toEqual([
      { id: "img-1", publicUrl: "https://example.com/1.webp" },
      { id: "img-2", publicUrl: "https://example.com/2.webp" }
    ]);
    expect(result.get("feedback-2")).toEqual([
      { id: "img-3", publicUrl: "https://example.com/3.webp" }
    ]);
  });

  it("skips rows with a null public_url instead of surfacing a broken thumbnail", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [{ id: "img-1", feedback_id: "feedback-1", public_url: null }],
      error: null
    });

    const result = await listFeedbackImagesByFeedbackIds(["feedback-1"]);

    expect(result.get("feedback-1") ?? []).toEqual([]);
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listFeedbackImagesByFeedbackIds(["feedback-1"])).rejects.toMatchObject({
      code: "FEEDBACK_IMAGES_BATCH_LIST_FAILED"
    });
  });
});
