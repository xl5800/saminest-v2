import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, maybeSingleMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = ["select", "eq"] as const;
  for (const method of chain) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = maybeSingleMock;
  return { queryBuilder: builder, maybeSingleMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { getCurrentUserRole } from "./profiles-repository";

describe("getCurrentUserRole", () => {
  beforeEach(() => {
    fromMock.mockClear();
    for (const key of Object.keys(queryBuilder)) {
      queryBuilder[key].mockClear();
    }
    maybeSingleMock.mockReset();
  });

  it("returns the role when the profile row exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: { role: "admin" }, error: null });

    const result = await getCurrentUserRole("user-1");

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(queryBuilder.select).toHaveBeenCalledWith("role");
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "user-1");
    expect(result).toBe("admin");
  });

  it("returns null without throwing when there is no matching profile row", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getCurrentUserRole("missing-user")).resolves.toBeNull();
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "network down", code: "500" }
    });

    await expect(getCurrentUserRole("user-1")).rejects.toMatchObject({
      code: "PROFILE_ROLE_FETCH_FAILED"
    });
  });
});
