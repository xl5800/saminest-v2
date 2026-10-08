import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, selectMock } = vi.hoisted(() => {
  const selectMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = vi.fn(() => builder);
  builder.select = selectMock;
  return { queryBuilder: builder, selectMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { insertCommunityPostImages } from "./community-post-images-repository";

const baseInput = {
  communityPostId: "cp-1",
  ownerId: "user-1",
  altText: null,
  width: null,
  height: null,
  mimeType: "image/webp",
  sizeBytes: 1024
};

describe("insertCommunityPostImages", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.insert.mockClear();
    selectMock.mockReset();
  });

  it("returns an empty array without calling Supabase when there is nothing to insert", async () => {
    expect(await insertCommunityPostImages([])).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("inserts every row into community_post_images in one batched insert and maps the returned rows", async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          id: "img-1",
          community_post_id: "cp-1",
          storage_path: "user-1/cp-1/a.webp",
          public_url: "https://example.com/a.webp",
          sort_order: 0
        },
        {
          id: "img-2",
          community_post_id: "cp-1",
          storage_path: "user-1/cp-1/b.webp",
          public_url: null,
          sort_order: 1
        }
      ],
      error: null
    });

    const result = await insertCommunityPostImages([
      { ...baseInput, storagePath: "user-1/cp-1/a.webp", publicUrl: "https://example.com/a.webp", sortOrder: 0 },
      { ...baseInput, storagePath: "user-1/cp-1/b.webp", publicUrl: null, sortOrder: 1 }
    ]);

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("community_post_images");
    expect(queryBuilder.insert).toHaveBeenCalledTimes(1);
    expect(queryBuilder.insert).toHaveBeenCalledWith([
      {
        community_post_id: "cp-1",
        owner_id: "user-1",
        storage_path: "user-1/cp-1/a.webp",
        public_url: "https://example.com/a.webp",
        alt_text: null,
        width: null,
        height: null,
        size_bytes: 1024,
        mime_type: "image/webp",
        sort_order: 0
      },
      {
        community_post_id: "cp-1",
        owner_id: "user-1",
        storage_path: "user-1/cp-1/b.webp",
        public_url: null,
        alt_text: null,
        width: null,
        height: null,
        size_bytes: 1024,
        mime_type: "image/webp",
        sort_order: 1
      }
    ]);
    expect(result).toEqual([
      {
        id: "img-1",
        communityPostId: "cp-1",
        storagePath: "user-1/cp-1/a.webp",
        publicUrl: "https://example.com/a.webp",
        sortOrder: 0
      },
      {
        id: "img-2",
        communityPostId: "cp-1",
        storagePath: "user-1/cp-1/b.webp",
        publicUrl: null,
        sortOrder: 1
      }
    ]);
  });

  it("throws COMMUNITY_POST_IMAGES_INSERT_FAILED when the insert fails (RLS, unique violation, ...)", async () => {
    selectMock.mockResolvedValue({ data: null, error: { message: "boom", code: "42501" } });

    await expect(
      insertCommunityPostImages([
        { ...baseInput, storagePath: "p", publicUrl: null, sortOrder: 0 }
      ])
    ).rejects.toMatchObject({ code: "COMMUNITY_POST_IMAGES_INSERT_FAILED" });
  });
});
