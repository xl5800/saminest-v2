import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: rpcMock })
}));

import { findNearestZipCode, listNearbyPostIds } from "./nearby-repository";

describe("nearby-repository", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls list_nearby_posts and maps the rows", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { post_id: "p1", distance_miles: 1.2 },
        { post_id: "p2", distance_miles: null }
      ],
      error: null
    });

    await expect(
      listNearbyPostIds({ latitude: 39.08, longitude: -77.15, categorySlugs: ["used"], limit: 20, offset: 40 })
    ).resolves.toEqual([
      { postId: "p1", distanceMiles: 1.2 },
      { postId: "p2", distanceMiles: null }
    ]);
    expect(rpcMock).toHaveBeenCalledWith("list_nearby_posts", {
      p_latitude: 39.08,
      p_longitude: -77.15,
      p_category_slugs: ["used"],
      p_limit: 20,
      p_offset: 40
    });
  });

  it("throws NEARBY_POSTS_FAILED when the query fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      listNearbyPostIds({ latitude: 0, longitude: 0, categorySlugs: ["used"], limit: 20, offset: 0 })
    ).rejects.toMatchObject({ code: "NEARBY_POSTS_FAILED" });
  });

  it("finds the nearest zip code, or null when there is none", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ zip: "20850", city: "Rockville", state_code: "MD" }], error: null });
    await expect(findNearestZipCode(39.08, -77.15)).resolves.toMatchObject({
      zip: "20850",
      city: "Rockville",
      stateCode: "MD"
    });
    expect(rpcMock).toHaveBeenCalledWith("nearest_zip_code", { p_latitude: 39.08, p_longitude: -77.15 });

    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await expect(findNearestZipCode(10, 10)).resolves.toBeNull();
  });

  it("throws NEAREST_ZIP_FAILED when the lookup fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(findNearestZipCode(0, 0)).rejects.toMatchObject({ code: "NEAREST_ZIP_FAILED" });
  });
});
