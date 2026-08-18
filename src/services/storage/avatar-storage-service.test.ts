import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, getPublicUrlMock, removeMock, storageFromMock, compressImageToWebpMock } =
  vi.hoisted(() => {
    const uploadMock = vi.fn();
    const getPublicUrlMock = vi.fn();
    const removeMock = vi.fn();
    const storageFromMock = vi.fn(() => ({
      upload: uploadMock,
      getPublicUrl: getPublicUrlMock,
      remove: removeMock
    }));
    const compressImageToWebpMock = vi.fn();
    return { uploadMock, getPublicUrlMock, removeMock, storageFromMock, compressImageToWebpMock };
  });

vi.mock("../../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    storage: { from: storageFromMock }
  })
}));

// 跟 post-image-storage-service.test.ts 一样默认让压缩失败（reject），
// 让所有没有显式针对压缩场景编写的测试，行为等价于"压缩这条路走不通、
// 退回原始文件上传"。
vi.mock("./compress-post-image", () => ({
  compressImageToWebp: compressImageToWebpMock
}));

import { avatarStorageService, parseAvatarStoragePathFromUrl } from "./avatar-storage-service";

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("avatarStorageService.uploadAvatar", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    getPublicUrlMock.mockReset();
    removeMock.mockReset();
    storageFromMock.mockClear();
    compressImageToWebpMock.mockReset();
    compressImageToWebpMock.mockRejectedValue(new Error("compression unavailable in this test"));
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => "11111111-1111-1111-1111-111111111111"
    });
  });

  it("uploads to the avatars bucket with a two-segment path (no post-id-style middle folder)", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({
      data: { publicUrl: "https://example.com/user-1/avatar.jpg" }
    });

    const file = makeFile("selfie.jpg", "image/jpeg", 1024);
    const result = await avatarStorageService.uploadAvatar({ file, userId: "user-1" });

    expect(storageFromMock).toHaveBeenCalledWith("avatars");
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/11111111-1111-1111-1111-111111111111.jpg",
      file,
      { contentType: "image/jpeg" }
    );
    expect(result.storagePath).toBe("user-1/11111111-1111-1111-1111-111111111111.jpg");
    expect(result.storagePath.startsWith("avatars/")).toBe(false);
    expect(result.publicUrl).toBe("https://example.com/user-1/avatar.jpg");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(1024);
  });

  it("maps image/png to a .png extension", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const file = makeFile("selfie.png", "image/png", 2048);
    const result = await avatarStorageService.uploadAvatar({ file, userId: "user-1" });

    expect(result.storagePath).toBe("user-1/11111111-1111-1111-1111-111111111111.png");
  });

  it("maps image/webp to a .webp extension", async () => {
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const file = makeFile("selfie.webp", "image/webp", 4096);
    const result = await avatarStorageService.uploadAvatar({ file, userId: "user-1" });

    expect(result.storagePath).toBe("user-1/11111111-1111-1111-1111-111111111111.webp");
  });

  it("throws an AppError for an unsupported mime type instead of guessing an extension", async () => {
    const file = makeFile("selfie.gif", "image/gif", 1024);

    await expect(
      avatarStorageService.uploadAvatar({ file, userId: "user-1" })
    ).rejects.toMatchObject({ code: "AVATAR_UNSUPPORTED_MIME_TYPE" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws an AppError when the Supabase upload fails", async () => {
    uploadMock.mockResolvedValue({
      data: null,
      error: { message: "storage down" }
    });

    const file = makeFile("selfie.jpg", "image/jpeg", 1024);

    await expect(
      avatarStorageService.uploadAvatar({ file, userId: "user-1" })
    ).rejects.toMatchObject({ code: "AVATAR_UPLOAD_FAILED" });
  });

  it("uploads the compressed file (as .webp) when compression succeeds", async () => {
    const compressedFile = makeFile("selfie.webp", "image/webp", 512);
    compressImageToWebpMock.mockResolvedValue(compressedFile);
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const original = makeFile("selfie.jpg", "image/jpeg", 10 * 1024 * 1024);
    const result = await avatarStorageService.uploadAvatar({
      file: original,
      userId: "user-1"
    });

    expect(compressImageToWebpMock).toHaveBeenCalledWith(original);
    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/11111111-1111-1111-1111-111111111111.webp",
      compressedFile,
      { contentType: "image/webp" }
    );
    expect(result.mimeType).toBe("image/webp");
    expect(result.sizeBytes).toBe(512);
  });

  it("falls back to uploading the original file when compression throws", async () => {
    compressImageToWebpMock.mockRejectedValue(new Error("createImageBitmap unsupported"));
    uploadMock.mockResolvedValue({ data: { path: "ignored" }, error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: null } });

    const original = makeFile("selfie.png", "image/png", 10 * 1024 * 1024);
    const result = await avatarStorageService.uploadAvatar({
      file: original,
      userId: "user-1"
    });

    expect(uploadMock).toHaveBeenCalledWith(
      "user-1/11111111-1111-1111-1111-111111111111.png",
      original,
      { contentType: "image/png" }
    );
    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(10 * 1024 * 1024);
  });
});

describe("avatarStorageService.removeAvatarFile", () => {
  beforeEach(() => {
    removeMock.mockReset();
    storageFromMock.mockClear();
  });

  it("removes the given single path, wrapped in an array", async () => {
    removeMock.mockResolvedValue({ data: [], error: null });

    await avatarStorageService.removeAvatarFile("user-1/old-avatar.webp");

    expect(storageFromMock).toHaveBeenCalledWith("avatars");
    expect(removeMock).toHaveBeenCalledWith(["user-1/old-avatar.webp"]);
  });

  it("throws an AppError when the removal fails", async () => {
    removeMock.mockResolvedValue({ data: null, error: { message: "storage down" } });

    await expect(
      avatarStorageService.removeAvatarFile("user-1/old-avatar.webp")
    ).rejects.toMatchObject({ code: "AVATAR_CLEANUP_FAILED" });
  });
});

describe("parseAvatarStoragePathFromUrl", () => {
  it("extracts the storage path from a well-formed public avatar URL", () => {
    const url =
      "https://project.supabase.co/storage/v1/object/public/avatars/user-1/11111111-1111-1111-1111-111111111111.webp";

    expect(parseAvatarStoragePathFromUrl(url)).toBe(
      "user-1/11111111-1111-1111-1111-111111111111.webp"
    );
  });

  it("strips a trailing query string", () => {
    const url =
      "https://project.supabase.co/storage/v1/object/public/avatars/user-1/img.webp?t=12345";

    expect(parseAvatarStoragePathFromUrl(url)).toBe("user-1/img.webp");
  });

  it("returns null when the URL does not contain the /avatars/ marker", () => {
    expect(parseAvatarStoragePathFromUrl("https://example.com/not-an-avatar-url")).toBeNull();
  });
});
