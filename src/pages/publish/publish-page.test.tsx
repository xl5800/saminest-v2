import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listActiveCategories,
  listActiveLocations,
  createPost,
  uploadPostImage,
  insertPostImages,
  navigateMock
} = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listActiveLocations: vi.fn(),
  createPost: vi.fn(),
  uploadPostImage: vi.fn(),
  insertPostImages: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/locations-repository", () => ({
  listActiveLocations
}));
vi.mock("../../repositories/posts-repository", () => ({
  createPost
}));
vi.mock("../../services/storage/post-image-storage-service", () => ({
  postImageStorageService: { uploadPostImage }
}));
vi.mock("../../repositories/post-images-repository", () => ({
  insertPostImages
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { PublishPage } from "./publish-page";

const initialAuthState = useAuthStore.getState();

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("分类"), {
    target: { value: "cat-1" }
  });
  fireEvent.change(screen.getByLabelText("标题"), {
    target: { value: "Sunny room near metro" }
  });
  fireEvent.change(screen.getByLabelText("描述"), {
    target: { value: "A description that is definitely long enough." }
  });
}

function makeImageFile(name: string): File {
  return new File(["fake image bytes"], name, { type: "image/png" });
}

function selectImages(files: File[]) {
  const input = screen.getByLabelText(/上传图片/) as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe("PublishPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveCategories.mockReset();
    listActiveLocations.mockReset();
    createPost.mockReset();
    uploadPostImage.mockReset();
    insertPostImages.mockReset();
    navigateMock.mockReset();

    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listActiveLocations.mockResolvedValue([
      { id: "loc-1", name: "Rockville" }
    ]);
    insertPostImages.mockResolvedValue([]);
    useAuthStore.getState().setSession({
      user: { id: "user-1" }
    } as never);
  });

  it("renders category and location options loaded from the database, not hardcoded", async () => {
    renderWithProviders(<PublishPage />);

    expect(
      await screen.findByRole("option", { name: "租房" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", { name: "Rockville" })
    ).toBeInTheDocument();
    expect(listActiveCategories).toHaveBeenCalled();
    expect(listActiveLocations).toHaveBeenCalled();
  });

  it("does not render any field for author_id or status", () => {
    renderWithProviders(<PublishPage />);

    expect(screen.queryByLabelText(/作者/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/状态/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it("blocks submission when the title is shorter than 5 characters", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fireEvent.change(screen.getByLabelText("分类"), {
      target: { value: "cat-1" }
    });
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "abcd" }
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "A description that is definitely long enough." }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "标题长度需要在 5-120 字符之间。"
    );
    expect(createPost).not.toHaveBeenCalled();
  });

  it("blocks submission when no category is selected", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "Sunny room near metro" }
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "A description that is definitely long enough." }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请选择分类。");
    expect(createPost).not.toHaveBeenCalled();
  });

  it("submits author_id from the auth store and hardcodes status to pending via createPost, then redirects with a success message", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith({
        authorId: "user-1",
        categoryId: "cat-1",
        locationId: null,
        title: "Sunny room near metro",
        description: "A description that is definitely long enough.",
        priceAmount: null,
        contactMethod: null,
        contactValue: null
      });
    });

    expect(navigateMock).toHaveBeenCalledWith("/post/post-999", {
      replace: true,
      state: { publishSuccessMessage: "发布成功，等待审核" }
    });
  });

  it("shows a generic error message and does not navigate when createPost fails", async () => {
    createPost.mockRejectedValue(new Error("insert failed"));
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "发布失败，请稍后重试。"
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the account-restricted message and does not navigate when createPost rejects with ACCOUNT_RESTRICTED", async () => {
    createPost.mockRejectedValue(
      new AppError(
        "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
        "ACCOUNT_RESTRICTED"
      )
    );
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("uploads each selected image then batch-inserts them, and navigates with the original success message when everything succeeds", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    uploadPostImage
      .mockResolvedValueOnce({
        storagePath: "user-1/post-999/img-0.png",
        publicUrl: "https://cdn.example.com/img-0.png",
        mimeType: "image/png",
        sizeBytes: 100
      })
      .mockResolvedValueOnce({
        storagePath: "user-1/post-999/img-1.png",
        publicUrl: "https://cdn.example.com/img-1.png",
        mimeType: "image/png",
        sizeBytes: 200
      });
    insertPostImages.mockResolvedValue([]);

    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    const fileA = makeImageFile("a.png");
    const fileB = makeImageFile("b.png");
    selectImages([fileA, fileB]);
    await screen.findByText("a.png");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(uploadPostImage).toHaveBeenCalledTimes(2);
    });
    expect(uploadPostImage).toHaveBeenNthCalledWith(1, {
      file: fileA,
      userId: "user-1",
      postId: "post-999"
    });
    expect(uploadPostImage).toHaveBeenNthCalledWith(2, {
      file: fileB,
      userId: "user-1",
      postId: "post-999"
    });

    await waitFor(() => {
      expect(insertPostImages).toHaveBeenCalledTimes(1);
    });
    expect(insertPostImages).toHaveBeenCalledWith([
      {
        postId: "post-999",
        ownerId: "user-1",
        storagePath: "user-1/post-999/img-0.png",
        publicUrl: "https://cdn.example.com/img-0.png",
        altText: null,
        width: null,
        height: null,
        sizeBytes: 100,
        mimeType: "image/png",
        sortOrder: 0
      },
      {
        postId: "post-999",
        ownerId: "user-1",
        storagePath: "user-1/post-999/img-1.png",
        publicUrl: "https://cdn.example.com/img-1.png",
        altText: null,
        width: null,
        height: null,
        sizeBytes: 200,
        mimeType: "image/png",
        sortOrder: 1
      }
    ]);

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/post/post-999", {
        replace: true,
        state: { publishSuccessMessage: "发布成功，等待审核" }
      });
    });
  });

  it("navigates to the post with a post-created-but-images-failed message when an image upload fails, without showing the generic submit error", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    uploadPostImage.mockRejectedValue(new Error("upload failed"));

    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    selectImages([makeImageFile("a.png")]);
    await screen.findByText("a.png");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/post/post-999", {
        replace: true,
        state: {
          publishSuccessMessage:
            "帖子已创建，等待审核，但部分图片上传失败，可以稍后重新上传。"
        }
      });
    });
    expect(insertPostImages).not.toHaveBeenCalled();
    expect(screen.queryByText("发布失败，请稍后重试。")).not.toBeInTheDocument();
  });

  it("navigates with the post-created-but-images-failed message when the batch insert fails even though all uploads succeeded", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    uploadPostImage.mockResolvedValue({
      storagePath: "user-1/post-999/img-0.png",
      publicUrl: "https://cdn.example.com/img-0.png",
      mimeType: "image/png",
      sizeBytes: 100
    });
    insertPostImages.mockRejectedValue(new Error("insert failed"));

    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    selectImages([makeImageFile("a.png")]);
    await screen.findByText("a.png");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/post/post-999", {
        replace: true,
        state: {
          publishSuccessMessage:
            "帖子已创建，等待审核，但部分图片上传失败，可以稍后重新上传。"
        }
      });
    });
    expect(screen.queryByText("发布失败，请稍后重试。")).not.toBeInTheDocument();
  });

  it("does not call uploadPostImage or insertPostImages, and keeps the original success message, when no images are selected", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/post/post-999", {
        replace: true,
        state: { publishSuccessMessage: "发布成功，等待审核" }
      });
    });
    expect(uploadPostImage).not.toHaveBeenCalled();
    expect(insertPostImages).not.toHaveBeenCalled();
  });
});
