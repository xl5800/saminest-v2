import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, insertMock, singleMock, overrideTypesMock, inMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const singleMock = vi.fn();
  const overrideTypesMock = vi.fn();
  // fetchTargetTitles 对 posts/activities 表的查询链路是 select().in()——
  // in() 直接被 await（本身是个 thenable），不像 select/eq/order 那样返回
  // builder 继续链式调用，所以单独给它一个 mock，而不是塞进下面的 chain 数组。
  const inMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = insertMock;
  const chain = ["select", "eq", "order"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = singleMock;
  builder.overrideTypes = overrideTypesMock;
  builder.in = inMock;
  return { queryBuilder: builder, insertMock, singleMock, overrideTypesMock, inMock };
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

  it("throws a distinct ACCOUNT_RESTRICTED AppError with a friendly message on an RLS violation (42501)", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: {
        message: "new row violates row-level security policy for table \"reports\"",
        code: "42501"
      }
    });

    await expect(
      createReport({
        reporterId: "user-1",
        targetType: "post",
        targetId: "post-1",
        reasonCode: "other",
        description: null
      })
    ).rejects.toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    });
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
    inMock.mockReset();
    // 默认没有举报命中 post/activity 分支时 fetchTargetTitles 直接短路返回，
    // 不会调用 in()；但为了不让没显式设置 inMock 的测试因为"上一个测试留下的
    // resolved value"而串味，这里给个保底的空结果。
    inMock.mockResolvedValue({ data: [], error: null });
  });

  it("defaults to status = pending, ordered by created_at ascending, with a nested reporter select", async () => {
    overrideTypesMock.mockResolvedValue({ data: [], error: null });

    await listReportsForModeration();

    expect(fromMock).toHaveBeenCalledWith("reports");
    expect(queryBuilder.select).toHaveBeenCalledWith(
      "id, reason_code, description, created_at, target_type, target_id, reporter:profiles!reports_reporter_id_fkey(display_name)"
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
          description: "看起来像广告",
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
        description: "看起来像广告",
        createdAt: "2026-07-01T00:00:00.000Z",
        targetType: "post",
        targetId: "post-1",
        targetTitle: null,
        reporterName: "Bob"
      }
    ]);
  });

  it("looks up and attaches the target post's title", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "report-1",
          reason_code: "spam",
          description: "看起来像广告",
          created_at: "2026-07-01T00:00:00.000Z",
          target_type: "post",
          target_id: "post-1",
          reporter: { display_name: "Bob" }
        }
      ],
      error: null
    });
    inMock.mockResolvedValue({ data: [{ id: "post-1", title: "全新沙发出售" }], error: null });

    const result = await listReportsForModeration();

    expect(fromMock).toHaveBeenCalledWith("posts");
    expect(queryBuilder.select).toHaveBeenCalledWith("id, title");
    expect(inMock).toHaveBeenCalledWith("id", ["post-1"]);
    expect(result[0].targetTitle).toBe("全新沙发出售");
  });

  it("looks up and attaches the target activity's title", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "report-2",
          reason_code: "harassment",
          description: null,
          created_at: "2026-07-01T00:00:00.000Z",
          target_type: "activity",
          target_id: "act-1",
          reporter: { display_name: "Bob" }
        }
      ],
      error: null
    });
    inMock.mockResolvedValue({ data: [{ id: "act-1", title: "周六一起打球" }], error: null });

    const result = await listReportsForModeration();

    expect(fromMock).toHaveBeenCalledWith("activities");
    expect(inMock).toHaveBeenCalledWith("id", ["act-1"]);
    expect(result[0].targetTitle).toBe("周六一起打球");
  });

  // UGC 安全功能补齐任务卡 2（举报用户）：target_type = "user" 时查
  // profiles 表的 display_name，跟 post/activity 分别查 posts/activities
  // 是同一个批量查询模式，只是换了张表、换了字段名（title → display_name）。
  it("looks up and attaches the target user's display name", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "report-3",
          reason_code: "harassment",
          description: null,
          created_at: "2026-07-01T00:00:00.000Z",
          target_type: "user",
          target_id: "user-9",
          reporter: { display_name: "Bob" }
        }
      ],
      error: null
    });
    inMock.mockResolvedValue({ data: [{ id: "user-9", display_name: "Alice" }], error: null });

    const result = await listReportsForModeration();

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(queryBuilder.select).toHaveBeenCalledWith("id, display_name");
    expect(inMock).toHaveBeenCalledWith("id", ["user-9"]);
    expect(result[0].targetTitle).toBe("Alice");
  });

  it("falls back to a null title, without throwing, when the title lookup query errors", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "report-1",
          reason_code: "spam",
          description: null,
          created_at: "2026-07-01T00:00:00.000Z",
          target_type: "post",
          target_id: "post-1",
          reporter: { display_name: "Bob" }
        }
      ],
      error: null
    });
    inMock.mockResolvedValue({ data: null, error: { message: "network down", code: "500" } });

    const result = await listReportsForModeration();

    expect(result[0].targetTitle).toBeNull();
  });

  it("skips the title lookup entirely for target types other than post/activity/user", async () => {
    overrideTypesMock.mockResolvedValue({
      data: [
        {
          id: "report-1",
          reason_code: "spam",
          description: null,
          created_at: "2026-07-01T00:00:00.000Z",
          target_type: "comment",
          target_id: "comment-1",
          reporter: { display_name: "Bob" }
        }
      ],
      error: null
    });

    const result = await listReportsForModeration();

    expect(inMock).not.toHaveBeenCalled();
    expect(result[0].targetTitle).toBeNull();
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
