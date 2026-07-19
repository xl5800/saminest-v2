import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, insertMock, singleMock, overrideTypesMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const singleMock = vi.fn();
  const overrideTypesMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = insertMock;
  const chain = ["select", "eq", "order"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = singleMock;
  builder.overrideTypes = overrideTypesMock;
  return { queryBuilder: builder, insertMock, singleMock, overrideTypesMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { createReport, listReportsForModeration } from "./reports-repository";

describe("createReport", () => {
  beforeEach(() => {
    fromMock.mockClear();
    insertMock.mockReset();
    insertMock.mockImplementation(() => queryBuilder);
    for (const key of ["select", "eq", "order"] as const) {
      queryBuilder[key].mockClear();
    }
    singleMock.mockReset();
    overrideTypesMock.mockReset();
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

describe("listReportsForModeration", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of ["select", "eq", "order"] as const) {
      queryBuilder[key].mockClear();
    }
    overrideTypesMock.mockReset();
  });

  it("defaults to status = pending, ordered by created_at ascending, with a nested reporter select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listReportsForModeration();

    expect(fromMock).toHaveBeenCalledWith("reports");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, reason_code, created_at, target_type, target_id, reporter:profiles!reports_reporter_id_fkey(display_name)"
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "pending");
    expect(queryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("filters by the given status when provided", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listReportsForModeration("resolved");

    expect(queryBuilder.eq).toHaveBeenCalledWith("status", "resolved");
  });

  it("maps rows to AdminReportListItem including the reporter's name", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "report-1",
          reason_code: "spam",
          created_at: "2026-07-01T00:00:00.000Z",
          target_type: "post",
          target_id: "post-1",
          reporter: { display_name: "Bob" }
        }
      ],
      error: null
    });

    const result = await listReportsForModeration();

    expect(result).toEqual([
      {
        id: "report-1",
        reasonCode: "spam",
        createdAt: "2026-07-01T00:00:00.000Z",
        targetType: "post",
        targetId: "post-1",
        reporterName: "Bob"
      }
    ]);
  });

  it("falls back to placeholder text when the joined reporter is missing", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "report-1",
          reason_code: "spam",
          created_at: "2026-07-01T00:00:00.000Z",
          target_type: "post",
          target_id: "post-1",
          reporter: null
        }
      ],
      error: null
    });

    const result = await listReportsForModeration();

    expect(result[0].reporterName).toBe("未知用户");
  });

  it("returns an empty list without throwing when there are no matching reports", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await expect(listReportsForModeration()).resolves.toEqual([]);
  });

  it("throws an AppError when the Supabase query fails", async () => {
    overrideTypesMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(listReportsForModeration()).rejects.toMatchObject({
      code: "ADMIN_REPORTS_LIST_FAILED"
    });
  });
});
