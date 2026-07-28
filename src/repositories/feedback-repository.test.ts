import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, insertMock, singleMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const singleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = insertMock;
  builder.select = vi.fn(() => builder);
  builder.single = singleMock;
  return { queryBuilder: builder, insertMock, singleMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { createFeedback, isFeedbackType } from "./feedback-repository";

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
