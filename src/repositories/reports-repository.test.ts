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

import { createReport } from "./reports-repository";

describe("createReport", () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockReset();
    insertMock.mockImplementation(() => queryBuilder);
    queryBuilder.select.mockClear();
    singleMock.mockReset();
  });

  it("inserts a report row and returns the new id", async () => {
    singleMock.mockResolvedValue({ data: { id: "report-1" }, error: null });

    const result = await createReport({
      reporterId: "user-1",
      targetType: "post",
      targetId: "post-1",
      reasonCode: "spam",
      description: "看起来像广告"
    });

    expect(fromMock).toHaveBeenCalledWith("reports");
    expect(insertMock).toHaveBeenCalledWith({
      reporter_id: "user-1",
      target_type: "post",
      target_id: "post-1",
      reason_code: "spam",
      description: "看起来像广告"
    });
    expect(queryBuilder.select).toHaveBeenCalledWith("id");
    expect(result).toEqual({ id: "report-1" });
  });

  it("throws a distinct REPORT_DUPLICATE AppError with a friendly message on a unique-violation", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" }
    });

    await expect(
      createReport({
        reporterId: "user-1",
        targetType: "post",
        targetId: "post-1",
        reasonCode: "spam",
        description: null
      })
    ).rejects.toMatchObject({
      code: "REPORT_DUPLICATE",
      message: "您已经举报过这条内容，正在处理中，请勿重复提交。"
    });
  });

  it("throws a generic AppError for any other insert failure", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "500" }
    });

    await expect(
      createReport({
        reporterId: "user-1",
        targetType: "post",
        targetId: "post-1",
        reasonCode: "other",
        description: null
      })
    ).rejects.toMatchObject({ code: "REPORT_CREATE_FAILED" });
  });

  it("throws an AppError when insert succeeds but no row id is returned", async () => {
    singleMock.mockResolvedValue({ data: null, error: null });

    await expect(
      createReport({
        reporterId: "user-1",
        targetType: "post",
        targetId: "post-1",
        reasonCode: "other",
        description: null
      })
    ).rejects.toMatchObject({ code: "REPORT_CREATE_ID_MISSING" });
  });
});
