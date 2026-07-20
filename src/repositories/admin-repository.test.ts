import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock })
}));

import {
  approvePost,
  deletePost,
  dismissReport,
  rejectPost,
  resolveReport,
  setAccountStatus
} from "./admin-repository";

describe("approvePost", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls approve_post with target_post_id", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await approvePost("post-1");

    expect(rpcMock).toHaveBeenCalledWith("approve_post", {
      target_post_id: "post-1"
    });
  });

  it("throws an AppError when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "post is not pending" }
    });

    await expect(approvePost("post-1")).rejects.toMatchObject({
      code: "ADMIN_APPROVE_POST_FAILED"
    });
  });
});

describe("rejectPost", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls reject_post with target_post_id and rejection_note", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await rejectPost("post-1", "内容违规");

    expect(rpcMock).toHaveBeenCalledWith("reject_post", {
      target_post_id: "post-1",
      rejection_note: "内容违规"
    });
  });

  it("throws an AppError when the RPC returns an error (e.g. empty note)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "rejection_note is required" }
    });

    await expect(rejectPost("post-1", "")).rejects.toMatchObject({
      code: "ADMIN_REJECT_POST_FAILED"
    });
  });
});

describe("resolveReport", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls resolve_report with target_report_id and resolution_note", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await resolveReport("report-1", "已核实并处理");

    expect(rpcMock).toHaveBeenCalledWith("resolve_report", {
      target_report_id: "report-1",
      resolution_note: "已核实并处理"
    });
  });

  it("throws an AppError when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "report is not pending/reviewing" }
    });

    await expect(resolveReport("report-1", "note")).rejects.toMatchObject({
      code: "ADMIN_RESOLVE_REPORT_FAILED"
    });
  });
});

describe("dismissReport", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls dismiss_report with target_report_id and resolution_note", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await dismissReport("report-1", "举报不成立");

    expect(rpcMock).toHaveBeenCalledWith("dismiss_report", {
      target_report_id: "report-1",
      resolution_note: "举报不成立"
    });
  });

  it("throws an AppError when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "resolution_note is required" }
    });

    await expect(dismissReport("report-1", "")).rejects.toMatchObject({
      code: "ADMIN_DISMISS_REPORT_FAILED"
    });
  });
});

describe("deletePost", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls delete_post with target_post_id and delete_reason", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await deletePost("post-1", "违反平台规则");

    expect(rpcMock).toHaveBeenCalledWith("delete_post", {
      target_post_id: "post-1",
      delete_reason: "违反平台规则"
    });
  });

  it("throws an AppError when the RPC returns an error (e.g. empty reason or already deleted)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "delete_reason is required" }
    });

    await expect(deletePost("post-1", "")).rejects.toMatchObject({
      code: "ADMIN_DELETE_POST_FAILED"
    });
  });
});

describe("setAccountStatus", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls set_account_status with target_user_id, new_account_status, and status_change_reason", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await setAccountStatus("user-1", "restricted", "多次发布违规内容");

    expect(rpcMock).toHaveBeenCalledWith("set_account_status", {
      target_user_id: "user-1",
      new_account_status: "restricted",
      status_change_reason: "多次发布违规内容"
    });
  });

  it("throws an AppError when the RPC returns an error (e.g. empty reason, no-op status, or self-targeting)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "cannot change your own account status" }
    });

    await expect(
      setAccountStatus("admin-1", "restricted", "note")
    ).rejects.toMatchObject({ code: "ADMIN_SET_ACCOUNT_STATUS_FAILED" });
  });
});
