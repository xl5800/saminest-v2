import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, removeMock, storageFromMock, compressImageToWebpMock } = vi.hoisted(() => {
  const uploadMock = vi.fn();
  const removeMock = vi.fn();
  const storageFromMock = vi.fn(() => ({
    upload: uploadMock,
    remove: removeMock
  }));
  const compressImageToWebpMock = vi.fn();
  return { uploadMock, removeMock, storageFromMock, compressImageToWebpMock };
});

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    storage: { from: storageFromMock }
  })
}));

// compressImageToWebp 本身没有单元测试（jsdom 不会真的解码图片/渲染
// canvas），这里 mock 掉它，只验证 uploadFeedbackImage 在"压缩成功"和
// "压缩失败"两种情况下各自的分支逻辑——跟 post-image-storage-service.test.ts
// 是同一个模式。
vi.mock("./compress-post-image", () => ({
  compressImageToWebp: compressImageToWebpMock
}));

import { feedbackImageStorageService } from "./feedback-image-storage-service";

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("feedbackImageStorageService.uploadFeedbackImage", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    removeMock.mockReset();
    storageFromMock.mockClear();
    compressImageToWebpMock.mockReset();
    compressImageToWebpMock.mockRejectedValue(new Error("compression unavailable in this test"));
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => "11111111-1111-1111-1111-111111111111"
    });
  });

  it("uploads to the feedback-images bucket with a path that is not double-prefixed with the bucket name, and returns a null publicUrl (private bucket)", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });

    const file = makeFile("shot.png", "image/png", 1024);
    const result = await feedbackImageStorageService.uploadFeedbackImage({
      file,
      userId: "user-1",
      feedbackId: "feedback-1"
    });

    expect(storageFromMock).toHaveBeenCalledWith("feedback-images");
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/feedback-1/11111111-1111-1111-1111-111111111111.png",
      file,
      { contentType: "image/png" }
    );
    expect(result.storagePath).toBe(
      "user-1/feedback-1/11111111-1111-1111-1111-111111111111.png"
    );
    expect(result.storagePath.startsWith("feedback-images/")).toBe(false);
    // 私有 bucket，不调用 getPublicUrl()，publicUrl 固定是 null——
    // 见 feedback-image-storage-service.ts 顶部说明。
    expect(result.publicUrl).toBeNull();
    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(1024);
  });

  it("throws an AppError for an unsupported mime type instead of guessing an extension", async () => {
    const file = makeFile("photo.gif", "image/gif", 1024);

    await expect(
      feedbackImageStorageService.uploadFeedbackImage({
        file,
        userId: "user-1",
        feedbackId: "feedback-1"
      })
    ).rejects.toMatchObject({ code: "FEEDBACK_IMAGE_UNSUPPORTED_MIME_TYPE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws an AppError when the Supabase upload fails", async () => {
    uploadMock.mockResolvedValue({
      data: null,
      error: { message: "storage down" }
    });

    const file = makeFile("shot.jpg", "image/jpeg", 1024);

    await expect(
      feedbackImageStorageService.uploadFeedbackImage({
        file,
        userId: "user-1",
        feedbackId: "feedback-1"
      })
    ).rejects.toMatchObject({ code: "FEEDBACK_IMAGE_UPLOAD_FAILED" });
  });

  it("uploads the compressed file (as .webp) when compression succeeds", async () => {
    const compressedFile = makeFile("shot.webp", "image/webp", 512);
    compressImageToWebpMock.mockResolvedValue(compressedFile);
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });

    const original = makeFile("shot.jpg", "image/jpeg", 10 * 1024 * 1024);
    const result = await feedbackImageStorageService.uploadFeedbackImage({
      file: original,
      userId: "user-1",
      feedbackId: "feedback-1"
    });

    expect(compressImageToWebpMock).toHaveBeenCalledWith(original);
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/feedback-1/11111111-1111-1111-1111-111111111111.webp",
      compressedFile,
      { contentType: "image/webp" }
    );
    expect(result.mimeType).toBe("image/webp");
    expect(result.sizeBytes).toBe(512);
  });

  it("falls back to uploading the original file when compression throws", async () => {
    compressImageToWebpMock.mockRejectedValue(new Error("createImageBitmap unsupported"));
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });

    const original = makeFile("shot.png", "image/png", 10 * 1024 * 1024);
    const result = await feedbackImageStorageService.uploadFeedbackImage({
      file: original,
      userId: "user-1",
      feedbackId: "feedback-1"
    });

    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/feedback-1/11111111-1111-1111-1111-111111111111.png",
      original,
      { contentType: "image/png" }
    );
    expect(result.mimeType).toBe("image/png");
  });
});

describe("feedbackImageStorageService.removeFeedbackImageFiles", () => {
  beforeEach(() => {
    removeMock.mockReset();
    storageFromMock.mockClear();
  });

  it("does nothing and does not call Supabase when given an empty array", async () => {
    await feedbackImageStorageService.removeFeedbackImageFiles([]);

    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("removes the given paths from the feedback-images bucket", async () => {
    removeMock.mockResolvedValue({ data: [{ name: "ignored" }], error: null });

    await feedbackImageStorageService.removeFeedbackImageFiles([
      "user-1/feedback-1/a.webp",
      "user-1/feedback-1/b.webp"
    ]);

    expect(storageFromMock).toHaveBeenCalledWith("feedback-images");
    expect(removeMock).toHaveBeenCalledWith([
      "user-1/feedback-1/a.webp",
      "user-1/feedback-1/b.webp"
    ]);
  });

  it("throws an AppError when the Supabase remove call fails", async () => {
    removeMock.mockResolvedValue({
      data: null,
      error: { message: "remove failed" }
    });

    await expect(
      feedbackImageStorageService.removeFeedbackImageFiles(["user-1/feedback-1/a.webp"])
    ).rejects.toMatchObject({ code: "FEEDBACK_IMAGE_CLEANUP_FAILED" });
  });
});
