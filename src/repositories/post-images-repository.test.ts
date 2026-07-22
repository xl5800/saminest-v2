import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryBuilder, selectMock, maybeSingleMock } = vi.hoisted(() => {
  const selectMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.insert = vi.fn(() => builder);
  builder.select = selectMock;
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  return { queryBuilder: builder, selectMock, maybeSingleMock };
});

const fromMock = vi.fn(() => queryBuilder);

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { insertPostImages, removeOwnPostImage } from "./post-images-repository";

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

describe("removeOwnPostImage", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.update.mockClear();
    queryBuilder.eq.mockClear();
    selectMock.mockReset();
    maybeSingleMock.mockReset();
    // 走 .update(...).eq(...).select("id").maybeSingle() 这条链——跟
    // insertPostImages 的 .insert(...).select(...) 不共用 select() 之后
    // 的用法，这里每个测试自己配好 select() 返回带 maybeSingle 的对象，
    // 不在模块顶层设默认实现，避免和 insertPostImages 那组测试的
    // selectMock.mockResolvedValue(...) 互相干扰。
    selectMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  });

  it("soft-deletes the image by id and resolves when a row was found", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "img-1" }, error: null });

    await removeOwnPostImage("img-1");

    expect(fromMock).toHaveBeenCalledWith("post_images");
    expect(queryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    );
    expect(queryBuilder.eq).toHaveBeenCalledWith("id", "img-1");
    expect(selectMock).toHaveBeenCalledWith("id");
  });

  it("throws an AppError when the Supabase update fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "update failed", code: "500" }
    });

    await expect(removeOwnPostImage("img-1")).rejects.toMatchObject({
      code: "POST_IMAGE_REMOVE_FAILED"
    });
  });

  it("throws a not-found AppError when no row was affected (not the owner, already deleted, or does not exist)", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(removeOwnPostImage("img-1")).rejects.toMatchObject({
      code: "POST_IMAGE_REMOVE_NOT_FOUND"
    });
  });
});
