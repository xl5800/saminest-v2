import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, maybeSingleMock, rpcMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq", "is"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = maybeSingleMock;
  return { queryBuilder: builder, maybeSingleMock, rpcMock: vi.fn() };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, rpc: rpcMock })
}));

import { AppError } from "../utils/app-error";
import {
  cancelAccountDeletion,
  getMyAccountDeletionStatus,
  requestAccountDeletion
} from "./account-deletion-repository";

describe("getMyAccountDeletionStatus", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    maybeSingleMock.mockReset();
  });

  it("returns null when there is no pending deletion request", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await getMyAccountDeletionStatus("user-1");

    expect(fromMock).toHaveBeenCalledWith("account_deletion_requests");
    expect(queryBuilder.select).toHaveBeenCalledWith("scheduled_purge_at");
    expect(queryBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(queryBuilder.is).toHaveBeenCalledWith("cancelled_at", null);
    expect(queryBuilder.is).toHaveBeenCalledWith("purged_at", null);
    expect(result).toBeNull();
  });

  it("returns the scheduled purge time when a request is pending", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { scheduled_purge_at: "2026-09-06T00:00:00.000Z" },
      error: null
    });

    const result = await getMyAccountDeletionStatus("user-1");

    expect(result).toEqual({ scheduledPurgeAt: "2026-09-06T00:00:00.000Z" });
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getMyAccountDeletionStatus("user-1")).rejects.toBeInstanceOf(AppError);
  });
});

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls the request_account_deletion RPC and returns its result", async () => {
    rpcMock.mockResolvedValue({ data: "2026-09-06T00:00:00.000Z", error: null });

    const result = await requestAccountDeletion();

    expect(rpcMock).toHaveBeenCalledWith("request_account_deletion");
    expect(result).toBe("2026-09-06T00:00:00.000Z");
  });

  it("throws an AppError when a deletion request is already pending", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "an account deletion request is already pending" }
    });

    await expect(requestAccountDeletion()).rejects.toBeInstanceOf(AppError);
  });
});

describe("cancelAccountDeletion", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls the cancel_account_deletion RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await cancelAccountDeletion();

    expect(rpcMock).toHaveBeenCalledWith("cancel_account_deletion");
  });

  it("throws an AppError when there is no pending request to cancel", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "no pending account deletion request found" }
    });

    await expect(cancelAccountDeletion()).rejects.toBeInstanceOf(AppError);
  });
});
