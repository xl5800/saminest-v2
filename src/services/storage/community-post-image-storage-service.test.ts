import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, removeMock, getPublicUrlMock, storageFromMock, compressImageToWebpMock } =
  vi.hoisted(() => {
    const uploadMock = vi.fn();
    const removeMock = vi.fn();
    const getPublicUrlMock = vi.fn();
    const storageFromMock = vi.fn(() => ({
      upload: uploadMock,
      remove: removeMock,
      getPublicUrl: getPublicUrlMock
    }));
    const compressImageToWebpMock = vi.fn();
    return { uploadMock, removeMock, getPublicUrlMock, storageFromMock, compressImageToWebpMock };
  });

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ storage: { from: storageFromMock } })
}));
// jsdom 不会真的解码图片/渲染 canvas，跟 post-image-storage-service.test.ts 一样
// mock 掉压缩，只验证"压缩成功/失败"两个分支各自的上传行为。默认设成失败。
vi.mock("./compress-post-image", () => ({ compressImageToWebp: compressImageToWebpMock }));

import { communityPostImageStorageService } from "./community-post-image-storage-service";

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("communityPostImageStorageService.uploadCommunityPostImage", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    removeMock.mockReset();
    getPublicUrlMock.mockReset();
    storageFromMock.mockClear();
    compressImageToWebpMock.mockReset();
    compressImageToWebpMock.mockRejectedValue(new Error("compression unavailable in this test"));
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => "11111111-1111-1111-1111-111111111111"
    });
  });

  it("uploads to the community-post-images bucket under {user}/{communityPost}/{image}.<ext> without a bucket-name prefix", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://example.com/public.jpg" } });
    const file = makeFile("photo.jpg", "image/jpeg", 1024);

    const result = await communityPostImageStorageService.uploadCommunityPostImage({
      file,
      userId: "user-1",
      communityPostId: "cp-1"
    });

    const expectedPath = "user-1/cp-1/11111111-1111-1111-1111-111111111111.jpg";
    expect(storageFromMock).toHaveBeenCalledWith("community-post-images");
    expect(uploadMock).toHaveBeenCalledWith(expectedPath, file, { contentType: "image/jpeg" });
    expect(getPublicUrlMock).toHaveBeenCalledWith(expectedPath);
    expect(result).toEqual({
      storagePath: expectedPath,
      publicUrl: "https://example.com/public.jpg",
      sizeBytes: 1024,
      mimeType: "image/jpeg"
    });
    expect(result.storagePath.startsWith("community-post-images/")).toBe(false);
  });

  it.each([
    ["image/png", "png"],
    ["image/webp", "webp"]
  ])("maps %s to a .%s extension when falling back to the original file", async (mimeType, extension) => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const result = await communityPostImageStorageService.uploadCommunityPostImage({
      file: makeFile("photo", mimeType, 2048),
      userId: "user-1",
      communityPostId: "cp-1"
    });

    expect(result.storagePath).toBe(
      `user-1/cp-1/11111111-1111-1111-1111-111111111111.${extension}`
    );
    expect(result.publicUrl).toBeNull();
  });

  it("uploads the compressed file as .webp when compression succeeds", async () => {
    const compressed = makeFile("photo.webp", "image/webp", 512);
    compressImageToWebpMock.mockResolvedValue(compressed);
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: "https://example.com/p.webp" } });

    const result = await communityPostImageStorageService.uploadCommunityPostImage({
      file: makeFile("photo.jpg", "image/jpeg", 8192),
      userId: "user-1",
      communityPostId: "cp-1"
    });

    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/cp-1/11111111-1111-1111-1111-111111111111.webp",
      compressed,
      { contentType: "image/webp" }
    );
    expect(result.sizeBytes).toBe(512);
    expect(result.mimeType).toBe("image/webp");
  });

  it("throws COMMUNITY_POST_IMAGE_UNSUPPORTED_MIME_TYPE instead of guessing an extension", async () => {
    await expect(
      communityPostImageStorageService.uploadCommunityPostImage({
        file: makeFile("photo.gif", "image/gif", 1024),
        userId: "user-1",
        communityPostId: "cp-1"
      })
    ).rejects.toMatchObject({ code: "COMMUNITY_POST_IMAGE_UNSUPPORTED_MIME_TYPE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws COMMUNITY_POST_IMAGE_UPLOAD_FAILED when the Storage upload fails", async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: "storage down" } });

    await expect(
      communityPostImageStorageService.uploadCommunityPostImage({
        file: makeFile("photo.jpg", "image/jpeg", 1024),
        userId: "user-1",
        communityPostId: "cp-1"
      })
    ).rejects.toMatchObject({ code: "COMMUNITY_POST_IMAGE_UPLOAD_FAILED" });
  });
});

describe("communityPostImageStorageService.removeCommunityPostImageFiles", () => {
  beforeEach(() => {
    removeMock.mockReset();
    storageFromMock.mockClear();
  });

  it("does nothing for an empty list", async () => {
    await communityPostImageStorageService.removeCommunityPostImageFiles([]);

    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("removes exactly the given paths from the community-post-images bucket", async () => {
    removeMock.mockResolvedValue({ data: [], error: null });

    await communityPostImageStorageService.removeCommunityPostImageFiles(["a/b/c.webp", "a/b/d.webp"]);

    expect(storageFromMock).toHaveBeenCalledWith("community-post-images");
    expect(removeMock).toHaveBeenCalledWith(["a/b/c.webp", "a/b/d.webp"]);
  });

  it("throws COMMUNITY_POST_IMAGE_CLEANUP_FAILED when the remove call fails", async () => {
    removeMock.mockResolvedValue({ data: null, error: { message: "nope" } });

    await expect(
      communityPostImageStorageService.removeCommunityPostImageFiles(["a/b/c.webp"])
    ).rejects.toMatchObject({ code: "COMMUNITY_POST_IMAGE_CLEANUP_FAILED" });
  });
});
