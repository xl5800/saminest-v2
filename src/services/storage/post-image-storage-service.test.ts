import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, getPublicUrlMock, storageFromMock } = vi.hoisted(() => {
  const uploadMock = vi.fn();
  const getPublicUrlMock = vi.fn();
  const storageFromMock = vi.fn(() => ({
    upload: uploadMock,
    getPublicUrl: getPublicUrlMock
  }));
  return { uploadMock, getPublicUrlMock, storageFromMock };
});

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    storage: { from: storageFromMock }
  })
}));

import { postImageStorageService } from "./post-image-storage-service";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  return file;
}

describe("postImageStorageService.uploadPostImage", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    getPublicUrlMock.mockReset();
    storageFromMock.mockClear();
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => "11111111-1111-1111-1111-111111111111"
    });
  });

  it("uploads to the post-images bucket with a path that is not double-prefixed with the bucket name", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://example.com/user-1/post-1/img.jpg" }
    });

    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    const result = await postImageStorageService.uploadPostImage({
      file,
      userId: "user-1",
      postId: "post-1"
    });

    expect(storageFromMock).toHaveBeenCalledWith("post-images");
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/post-1/11111111-1111-1111-1111-111111111111.jpg",
      file,
      { contentType: "image/jpeg" }
    );
    expect(result.storagePath).toBe(
      "user-1/post-1/11111111-1111-1111-1111-111111111111.jpg"
    );
    expect(result.storagePath.startsWith("post-images/")).toBe(false);
    expect(result.publicUrl).toBe("https://example.com/user-1/post-1/img.jpg");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(1024);
  });

  it("maps image/png to a .png extension", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const file = makeFile("photo.png", "image/png", 2048);
    const result = await postImageStorageService.uploadPostImage({
      file,
      userId: "user-1",
      postId: "post-1"
    });

    expect(result.storagePath).toBe(
      "user-1/post-1/11111111-1111-1111-1111-111111111111.png"
    );
  });

  it("maps image/webp to a .webp extension", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const file = makeFile("photo.webp", "image/webp", 4096);
    const result = await postImageStorageService.uploadPostImage({
      file,
      userId: "user-1",
      postId: "post-1"
    });

    expect(result.storagePath).toBe(
      "user-1/post-1/11111111-1111-1111-1111-111111111111.webp"
    );
  });

  it("throws an AppError for an unsupported mime type instead of guessing an extension", async () => {
    const file = makeFile("photo.gif", "image/gif", 1024);

    await expect(
      postImageStorageService.uploadPostImage({
        file,
        userId: "user-1",
        postId: "post-1"
      })
    ).rejects.toMatchObject({ code: "POST_IMAGE_UNSUPPORTED_MIME_TYPE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws an AppError when the Supabase upload fails", async () => {
    uploadMock.mockResolvedValue({
      data: null,
      error: { message: "storage down" }
    });

    const file = makeFile("photo.jpg", "image/jpeg", 1024);

    await expect(
      postImageStorageService.uploadPostImage({
        file,
        userId: "user-1",
        postId: "post-1"
      })
    ).rejects.toMatchObject({ code: "POST_IMAGE_UPLOAD_FAILED" });
  });
});
