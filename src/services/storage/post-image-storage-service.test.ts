import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, getPublicUrlMock, storageFromMock, compressImageToWebpMock } = vi.hoisted(() => {
  const uploadMock = vi.fn();
  const getPublicUrlMock = vi.fn();
  const storageFromMock = vi.fn(() => ({
    upload: uploadMock,
    getPublicUrl: getPublicUrlMock
  }));
  const compressImageToWebpMock = vi.fn();
  return { uploadMock, getPublicUrlMock, storageFromMock, compressImageToWebpMock };
});

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    storage: { from: storageFromMock }
  })
}));

// compressImageToWebp 本身没有单元测试（jsdom 不会真的解码图片/渲染
// canvas，测不出压缩效果），这里 mock 掉它，只验证 uploadPostImage
// 在"压缩成功"和"压缩失败"两种情况下各自的分支逻辑。默认设成失败
// （reject），让所有没有显式针对压缩场景编写的既有测试，行为等价于
// "压缩这条路走不通、退回原始文件上传"——这跟压缩功能上线前的行为完全
// 一致，不需要因为加了压缩就重写这些测试的断言。
vi.mock("./compress-post-image", () => ({
  compressImageToWebp: compressImageToWebpMock
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
    compressImageToWebpMock.mockReset();
    compressImageToWebpMock.mockRejectedValue(new Error("compression unavailable in this test"));
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

  it("uploads the compressed file (as .webp) when compression succeeds", async () => {
    const compressedFile = makeFile("photo.webp", "image/webp", 512);
    compressImageToWebpMock.mockResolvedValue(compressedFile);
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const original = makeFile("photo.jpg", "image/jpeg", 10 * 1024 * 1024);
    const result = await postImageStorageService.uploadPostImage({
      file: original,
      userId: "user-1",
      postId: "post-1"
    });

    expect(compressImageToWebpMock).toHaveBeenCalledWith(original);
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/post-1/11111111-1111-1111-1111-111111111111.webp",
      compressedFile,
      { contentType: "image/webp" }
    );
    expect(result.storagePath).toBe(
      "user-1/post-1/11111111-1111-1111-1111-111111111111.webp"
    );
    expect(result.mimeType).toBe("image/webp");
    expect(result.sizeBytes).toBe(512);
  });

  it("falls back to uploading the original file when compression throws", async () => {
    compressImageToWebpMock.mockRejectedValue(new Error("createImageBitmap unsupported"));
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const original = makeFile("photo.png", "image/png", 10 * 1024 * 1024);
    const result = await postImageStorageService.uploadPostImage({
      file: original,
      userId: "user-1",
      postId: "post-1"
    });

    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/post-1/11111111-1111-1111-1111-111111111111.png",
      original,
      { contentType: "image/png" }
    );
    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(10 * 1024 * 1024);
  });
});
