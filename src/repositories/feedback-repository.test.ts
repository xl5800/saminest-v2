import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  queryBuilder,
  insertMock,
  singleMock,
  listQueryBuilder,
  orderMock,
  overrideTypesMock,
  fromMock,
  rpcMock,
  listFeedbackImagesByFeedbackIds
} = vi.hoisted(() => {
  const insertMock = vi.fn();
  const singleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = insertMock;
  builder.select = vi.fn(() => builder);
  builder.single = singleMock;

  // listFeedbackForAdmin 走一条不同的链式调用（select -> eq -> order ->
  // overrideTypes），跟上面 createFeedback 的 insert -> select -> single 链
  // 形状不一样，用独立的 builder，通过 fromMock.mockImplementation 按
  // describe 块切换，跟 feedback-images-repository.test.ts 是同一个处理
  // 方式。order 本身继续链式返回 builder（不是终点），真正被 await 的是
  // overrideTypes 这一步。
  const orderMock = vi.fn();
  const overrideTypesMock = vi.fn();
  const listQueryBuilder: Record<string, ReturnType<typeof vi.fn>> = {};
  listQueryBuilder.select = vi.fn(() => listQueryBuilder);
  listQueryBuilder.eq = vi.fn(() => listQueryBuilder);
  orderMock.mockImplementation(() => listQueryBuilder);
  listQueryBuilder.order = orderMock;
  listQueryBuilder.overrideTypes = overrideTypesMock;

  const fromMock = vi.fn(() => builder);
  const rpcMock = vi.fn();
  const listFeedbackImagesByFeedbackIds = vi.fn();

  return {
    queryBuilder: builder,
    insertMock,
    singleMock,
    listQueryBuilder,
    orderMock,
    overrideTypesMock,
    fromMock,
    rpcMock,
    listFeedbackImagesByFeedbackIds
  };
});

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, rpc: rpcMock })
}));
// listFeedbackForAdmin 内部调用的截图批量查询已经在
// feedback-images-repository.test.ts 里独立测试过，这里 mock 掉，不重复
// 验证它自己的查询细节，只验证 listFeedbackForAdmin 把返回的 Map 正确拼进
// 每条反馈的 images 字段。
vi.mock("./feedback-images-repository", () => ({
  listFeedbackImagesByFeedbackIds
}));

import { createFeedback, isFeedbackType, listFeedbackForAdmin, setFeedbackStatus } from "./feedback-repository";

describe("createFeedback", () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockReset();
    insertMock.mockImplementation(() => queryBuilder);
    queryBuilder.select.mockClear();
    singleMock.mockReset();
  });

  it("inserts a feedback row (without a status column, the database default handles it) and returns the new id", async () => {
    singleMock.mockResolvedValue({ data: { id: "feedback-1" }, error: null });

    const result = await createFeedback({
      userId: "user-1",
      type: "bug",
      title: "首页图片加载失败",
      content: "封面图一直显示占位图，详情页正常。"
    });

    expect(fromMock).toHaveBeenCalledWith("feedback");
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "user-1",
      type: "bug",
      title: "首页图片加载失败",
      content: "封面图一直显示占位图，详情页正常。"
    });
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "feedback-1" });
  });

  it("throws an ACCOUNT_RESTRICTED AppError when the insert fails with an RLS violation (42501)", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "new row violates row-level security policy", code: "42501" }
    });

    await expect(
      createFeedback({
        userId: "user-1",
        type: "bug",
        title: "首页图片加载失败",
        content: "封面图一直显示占位图，详情页正常。"
      })
    ).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
  });

  it("throws a generic FEEDBACK_CREATE_FAILED AppError for any other insert failure", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "500" }
    });

    await expect(
      createFeedback({
        userId: "user-1",
        type: "bug",
        title: "首页图片加载失败",
        content: "封面图一直显示占位图，详情页正常。"
      })
    ).rejects.toMatchObject({ code: "FEEDBACK_CREATE_FAILED" });
  });

  it("throws FEEDBACK_CREATE_ID_MISSING when the insert succeeds but no row comes back", async () => {
    singleMock.mockResolvedValue({ data: null, error: null });

    await expect(
      createFeedback({
        userId: "user-1",
        type: "bug",
        title: "首页图片加载失败",
        content: "封面图一直显示占位图，详情页正常。"
      })
    ).rejects.toMatchObject({ code: "FEEDBACK_CREATE_ID_MISSING" });
  });
});

describe("isFeedbackType", () => {
  it("accepts every documented feedback type", () => {
    for (const type of ["bug", "suggestion", "complaint", "other"]) {
      expect(isFeedbackType(type)).toBe(true);
    }
  });

  it("rejects an unrecognized value", () => {
    expect(isFeedbackType("compliment")).toBe(false);
  });
});

describe("listFeedbackForAdmin", () => {
  beforeEach(() => {
    fromMock.mockClear();
    fromMock.mockImplementation(() => listQueryBuilder);
    listQueryBuilder.select.mockClear();
    listQueryBuilder.eq.mockClear();
    // 用 mockClear 而不是 mockReset——后者会把 vi.hoisted 里设好的
    // `() => listQueryBuilder` 链式返回值也清掉，order 就不再可链式调用了。
    orderMock.mockClear();
    overrideTypesMock.mockReset();
    listFeedbackImagesByFeedbackIds.mockReset();
    listFeedbackImagesByFeedbackIds.mockResolvedValue(new Map());
  });

  afterEach(() => {
    // 还原成 createFeedback 那组测试用的默认 builder。
    fromMock.mockImplementation(() => queryBuilder);
  });

  it("defaults to status='pending', selecting the submitter's display name via the feedback_user_id_fkey relationship, ordered by created_at ascending", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listFeedbackForAdmin();

    expect(fromMock).toHaveBeenCalledWith("feedback");
    expect(listQueryBuilder.select).toHaveBeenCalledWith(
      "id, type, title, content, status, created_at, submitter:profiles!feedback_user_id_fkey(display_name)"
    );
    expect(listQueryBuilder.eq).toHaveBeenCalledWith("status", "pending");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("filters by an explicitly passed status", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listFeedbackForAdmin("resolved");

    expect(listQueryBuilder.eq).toHaveBeenCalledWith("status", "resolved");
  });

  it("maps rows to AdminFeedbackListItem, attaching each feedback's images from the batch lookup by id", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "feedback-1",
          type: "bug",
          title: "首页图片加载失败",
          content: "封面图一直显示占位图。",
          status: "pending",
          created_at: "2026-08-01T00:00:00.000Z",
          submitter: { display_name: "Alice" }
        },
        {
          id: "feedback-2",
          type: "suggestion",
          title: "希望能暗色模式",
          content: "晚上用眼睛太累了。",
          status: "pending",
          created_at: "2026-08-02T00:00:00.000Z",
          submitter: null
        }
      ],
      error: null
    });
    listFeedbackImagesByFeedbackIds.mockResolvedValue(
      new Map([["feedback-1", [{ id: "img-1", publicUrl: "https://example.com/1.webp" }]]])
    );

    const result = await listFeedbackForAdmin();

    expect(listFeedbackImagesByFeedbackIds).toHaveBeenCalledWith(["feedback-1", "feedback-2"]);
    expect(result).toEqual([
      {
        id: "feedback-1",
        type: "bug",
        title: "首页图片加载失败",
        content: "封面图一直显示占位图。",
        status: "pending",
        createdAt: "2026-08-01T00:00:00.000Z",
        submitterName: "Alice",
        images: [{ id: "img-1", publicUrl: "https://example.com/1.webp" }]
      },
      {
        id: "feedback-2",
        type: "suggestion",
        title: "希望能暗色模式",
        content: "晚上用眼睛太累了。",
        status: "pending",
        createdAt: "2026-08-02T00:00:00.000Z",
        submitterName: "未知用户",
        images: []
      }
    ]);
  });

  it("throws an AppError when the query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listFeedbackForAdmin()).rejects.toMatchObject({
      code: "ADMIN_FEEDBACK_LIST_FAILED"
    });
  });
});

describe("setFeedbackStatus", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls the set_feedback_status RPC with the feedback id and new status", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await setFeedbackStatus("feedback-1", "in_progress");

    expect(rpcMock).toHaveBeenCalledWith("set_feedback_status", {
      target_feedback_id: "feedback-1",
      new_status: "in_progress"
    });
  });

  it("throws an AppError when the RPC call fails", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "not an admin", code: "P0001" }
    });

    await expect(setFeedbackStatus("feedback-1", "resolved")).rejects.toMatchObject({
      code: "ADMIN_SET_FEEDBACK_STATUS_FAILED"
    });
  });
});
