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

import { insertPostImages } from "./post-images-repository";

describe("insertPostImages", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.insert.mockClear();
    selectMock.mockReset();
  });

  it("returns an empty array without calling Supabase when there is nothing to insert", async () => {
    const result = await insertPostImages([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("inserts every row in a single batched insert call", async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          id: "img-1",
          post_id: "post-1",
          storage_path: "user-1/post-1/img-1.jpg",
          public_url: "https://example.com/img-1.jpg",
          sort_order: 0
        },
        {
          id: "img-2",
          post_id: "post-1",
          storage_path: "user-1/post-1/img-2.png",
          public_url: "https://example.com/img-2.png",
          sort_order: 1
        }
      ],
      error: null
    });

    const result = await insertPostImages([
      {
        postId: "post-1",
        ownerId: "user-1",
        storagePath: "user-1/post-1/img-1.jpg",
        publicUrl: "https://example.com/img-1.jpg",
        altText: null,
        width: null,
        height: null,
        sizeBytes: 1024,
        mimeType: "image/jpeg",
        sortOrder: 0
      },
      {
        postId: "post-1",
        ownerId: "user-1",
        storagePath: "user-1/post-1/img-2.png",
        publicUrl: "https://example.com/img-2.png",
        altText: null,
        width: null,
        height: null,
        sizeBytes: 2048,
        mimeType: "image/png",
        sortOrder: 1
      }
    ]);

    expect(fromMock).toHaveBeenCalledWith("post_images");
    expect(queryBuilder.insert).toHaveBeenCalledTimes(1);
    expect(queryBuilder.insert).toHaveBeenCalledWith([
      {
        post_id: "post-1",
        owner_id: "user-1",
        storage_path: "user-1/post-1/img-1.jpg",
        public_url: "https://example.com/img-1.jpg",
        alt_text: null,
        width: null,
        height: null,
        size_bytes: 1024,
        mime_type: "image/jpeg",
        sort_order: 0
      },
      {
        post_id: "post-1",
        owner_id: "user-1",
        storage_path: "user-1/post-1/img-2.png",
        public_url: "https://example.com/img-2.png",
        alt_text: null,
        width: null,
        height: null,
        size_bytes: 2048,
        mime_type: "image/png",
        sort_order: 1
      }
    ]);
    expect(result).toEqual([
      {
        id: "img-1",
        postId: "post-1",
        storagePath: "user-1/post-1/img-1.jpg",
        publicUrl: "https://example.com/img-1.jpg",
        sortOrder: 0
      },
      {
        id: "img-2",
        postId: "post-1",
        storagePath: "user-1/post-1/img-2.png",
        publicUrl: "https://example.com/img-2.png",
        sortOrder: 1
      }
    ]);
  });

  it("throws an AppError when the insert fails", async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "500" }
    });

    await expect(
      insertPostImages([
        {
          postId: "post-1",
          ownerId: "user-1",
          storagePath: "user-1/post-1/img-1.jpg",
          publicUrl: null,
          altText: null,
          width: null,
          height: null,
          sizeBytes: 1024,
          mimeType: "image/jpeg",
          sortOrder: 0
        }
      ])
    ).rejects.toMatchObject({ code: "POST_IMAGES_INSERT_FAILED" });
  });

  it("returns an empty array when the insert succeeds but no rows come back", async () => {
    selectMock.mockResolvedValue({ data: null, error: null });

    const result = await insertPostImages([
      {
        postId: "post-1",
        ownerId: "user-1",
        storagePath: "user-1/post-1/img-1.jpg",
        publicUrl: null,
        altText: null,
        width: null,
        height: null,
        sizeBytes: 1024,
        mimeType: "image/jpeg",
        sortOrder: 0
      }
    ]);

    expect(result).toEqual([]);
  });
});
