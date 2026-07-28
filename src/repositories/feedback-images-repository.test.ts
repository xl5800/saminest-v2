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

import { insertFeedbackImages } from "./feedback-images-repository";

describe("insertFeedbackImages", () => {
  beforeEach(() => {
    fromMock.mockClear();
    queryBuilder.insert.mockClear();
    selectMock.mockReset();
  });

  it("returns an empty array without calling Supabase when there is nothing to insert", async () => {
    const result = await insertFeedbackImages([]);

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("inserts every row in a single batched insert call (no alt_text column, unlike post_images)", async () => {
    selectMock.mockResolvedValue({
      data: [
        {
          id: "img-1",
          feedback_id: "feedback-1",
          storage_path: "user-1/feedback-1/img-1.webp",
          public_url: null,
          sort_order: 0
        }
      ],
      error: null
    });

    const result = await insertFeedbackImages([
      {
        feedbackId: "feedback-1",
        ownerId: "user-1",
        storagePath: "user-1/feedback-1/img-1.webp",
        publicUrl: null,
        width: null,
        height: null,
        sizeBytes: 1024,
        mimeType: "image/webp",
        sortOrder: 0
      }
    ]);

    expect(fromMock).toHaveBeenCalledWith("feedback_images");
    expect(queryBuilder.insert).toHaveBeenCalledWith([
      {
        feedback_id: "feedback-1",
        owner_id: "user-1",
        storage_path: "user-1/feedback-1/img-1.webp",
        public_url: null,
        width: null,
        height: null,
        size_bytes: 1024,
        mime_type: "image/webp",
        sort_order: 0
      }
    ]);
    expect(result).toEqual([
      {
        id: "img-1",
        feedbackId: "feedback-1",
        storagePath: "user-1/feedback-1/img-1.webp",
        publicUrl: null,
        sortOrder: 0
      }
    ]);
  });

  it("throws an AppError when the insert fails", async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { message: "insert failed", code: "23505" }
    });

    await expect(
      insertFeedbackImages([
        {
          feedbackId: "feedback-1",
          ownerId: "user-1",
          storagePath: "user-1/feedback-1/img-1.webp",
          publicUrl: null,
          width: null,
          height: null,
          sizeBytes: 1024,
          mimeType: "image/webp",
          sortOrder: 0
        }
      ])
    ).rejects.toMatchObject({ code: "FEEDBACK_IMAGES_INSERT_FAILED" });
  });

  it("returns an empty array when the insert succeeds but no rows come back", async () => {
    selectMock.mockResolvedValue({ data: null, error: null });

    const result = await insertFeedbackImages([
      {
        feedbackId: "feedback-1",
        ownerId: "user-1",
        storagePath: "user-1/feedback-1/img-1.webp",
        publicUrl: null,
        width: null,
        height: null,
        sizeBytes: 1024,
        mimeType: "image/webp",
        sortOrder: 0
      }
    ]);

    expect(result).toEqual([]);
  });
});
