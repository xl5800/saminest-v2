import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listActiveCategories,
  listActiveLocations,
  createPost,
  getPostDetail,
  updatePost,
  uploadPostImage,
  removePostImageFiles,
  insertPostImages,
  removeOwnPostImage,
  navigateMock
} = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listActiveLocations: vi.fn(),
  createPost: vi.fn(),
  getPostDetail: vi.fn(),
  updatePost: vi.fn(),
  uploadPostImage: vi.fn(),
  removePostImageFiles: vi.fn(),
  insertPostImages: vi.fn(),
  removeOwnPostImage: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/locations-repository", () => ({
  listActiveLocations
}));
vi.mock("../../repositories/posts-repository", () => ({
  createPost,
  getPostDetail,
  updatePost
}));
vi.mock("../../services/storage/post-image-storage-service", () => ({
  postImageStorageService: { uploadPostImage, removePostImageFiles }
}));
vi.mock("../../repositories/post-images-repository", () => ({
  insertPostImages,
  removeOwnPostImage
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { usePendingFormRegionStore } from "../../store/pending-form-region-store";
import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { PublishPage } from "./publish-page";

const initialAuthState = useAuthStore.getState();
const initialPendingRegionState = usePendingFormRegionStore.getState();

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

/**
 * 跟 renderWithProviders 内部结构完全一样（QueryClientProvider +
 * MemoryRouter + Routes），唯一区别是把 QueryClient 实例返回给调用方，
 * 这样测试才能在这个具体实例上 spy invalidateQueries——renderWithProviders
 * 自己在内部 new 了一个不对外暴露的 QueryClient，测不了这个。
 */
function renderWithSpyableQueryClient(
  ui: ReactElement,
  options: { initialEntries?: string[]; route?: string } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={options.initialEntries}>
        <Routes>
          <Route path={options.route ?? "*"} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { ...result, invalidateQueriesSpy };
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
    getPostDetail.mockReset();
    updatePost.mockReset();
    uploadPostImage.mockReset();
    removePostImageFiles.mockReset();
    insertPostImages.mockReset();
    removeOwnPostImage.mockReset();
    navigateMock.mockReset();
    usePendingFormRegionStore.setState(initialPendingRegionState, true);

    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listActiveLocations.mockResolvedValue([
      { id: "loc-1", name: "Rockville" }
    ]);
    insertPostImages.mockResolvedValue([]);
    removePostImageFiles.mockResolvedValue(undefined);
    useAuthStore.getState().setSession({
      user: { id: "user-1" }
    } as never);
  });

  it("renders category options loaded from the database, not hardcoded", async () => {
    renderWithProviders(<PublishPage />);

    expect(
      await screen.findByRole("option", { name: "租房" })
    ).toBeInTheDocument();
    expect(listActiveCategories).toHaveBeenCalled();
  });

  // 12 号卡：地区字段不再是原生 <select>（也不再直接查 locations 表拿城市
  // 列表，见 publish-page.tsx 顶部注释），改成跳转 /region-select?mode=form
  // 整页选择。这里只断言"点了会跳转到对的路径"，回填逻辑（消费
  // usePendingFormRegionStore）单独用下面几个测试覆盖，不依赖真的渲染
  // RegionSelectPage（那是它自己文件里的测试范围）。
  it("shows '不限地区' by default and navigates to /region-select?mode=form when the 地区 field is clicked", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    expect(screen.getByText("不限地区")).toBeInTheDocument();
    fireEvent.click(screen.getByText("不限地区"));

    expect(navigateMock).toHaveBeenCalledWith("/region-select?mode=form");
  });

  it("preselects the category from a ?category=<slug> query param (used by the publish action sheet's 发布租房/求租/二手 entries)", async () => {
    renderWithProviders(<PublishPage />, { initialEntries: ["/publish?category=rent"] });

    await screen.findByRole("option", { name: "租房" });

    expect(screen.getByLabelText("分类")).toHaveValue("cat-1");
  });

  it("leaves the category blank when ?category=<slug> does not match any loaded category", async () => {
    renderWithProviders(<PublishPage />, {
      initialEntries: ["/publish?category=not-a-real-slug"]
    });

    await screen.findByRole("option", { name: "租房" });

    expect(screen.getByLabelText("分类")).toHaveValue("");
  });

  it("does not render any field for author_id or status", () => {
    renderWithProviders(<PublishPage />);

    expect(screen.queryByLabelText(/作者/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/状态/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it("blocks submission when the title is empty", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fireEvent.change(screen.getByLabelText("分类"), {
      target: { value: "cat-1" }
    });
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "   " }
    });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "A description that is definitely long enough." }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入标题。");
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
        locationText: null,
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

  it("invalidates the posts/my-posts/favorited-posts list caches after a successful image upload (regression: 首页/我的发布缓存没刷新的问题)", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    uploadPostImage.mockResolvedValue({
      storagePath: "user-1/post-999/img-0.png",
      publicUrl: "https://cdn.example.com/img-0.png",
      mimeType: "image/png",
      sizeBytes: 100
    });
    insertPostImages.mockResolvedValue([]);

    const { invalidateQueriesSpy } = renderWithSpyableQueryClient(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    selectImages([makeImageFile("a.png")]);
    await screen.findByText("a.png");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["posts"] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["my-posts"] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["favorited-posts"] });
  });

  it("does not invalidate any list caches when no images were selected (nothing in post_images could have changed)", async () => {
    createPost.mockResolvedValue({ id: "post-999" });

    const { invalidateQueriesSpy } = renderWithSpyableQueryClient(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
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

  it("cleans up the just-uploaded Storage files when the batch insert fails (avoids leaving orphaned files)", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    uploadPostImage
      .mockResolvedValueOnce({
        storagePath: "user-1/post-999/img-0.webp",
        publicUrl: "https://cdn.example.com/img-0.webp",
        mimeType: "image/webp",
        sizeBytes: 100
      })
      .mockResolvedValueOnce({
        storagePath: "user-1/post-999/img-1.webp",
        publicUrl: "https://cdn.example.com/img-1.webp",
        mimeType: "image/webp",
        sizeBytes: 200
      });
    insertPostImages.mockRejectedValue({
      message: "duplicate key value violates unique constraint",
      code: "23505",
      details: "Key (post_id, sort_order)=(post-999, 0) already exists.",
      hint: null
    });

    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    selectImages([makeImageFile("a.png"), makeImageFile("b.png")]);
    await screen.findByText("a.png");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(removePostImageFiles).toHaveBeenCalledWith([
        "user-1/post-999/img-0.webp",
        "user-1/post-999/img-1.webp"
      ]);
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/post/post-999", {
        replace: true,
        state: {
          publishSuccessMessage:
            "帖子已创建，等待审核，但部分图片上传失败，可以稍后重新上传。"
        }
      });
    });
  });

  it("does not crash and still shows the image-failure message when the cleanup itself also fails after an insert failure", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createPost.mockResolvedValue({ id: "post-999" });
    uploadPostImage.mockResolvedValue({
      storagePath: "user-1/post-999/img-0.webp",
      publicUrl: "https://cdn.example.com/img-0.webp",
      mimeType: "image/webp",
      sizeBytes: 100
    });
    const insertError = { message: "insert failed", code: "23505" };
    insertPostImages.mockRejectedValue(insertError);
    const cleanupError = { message: "remove failed", code: "500" };
    removePostImageFiles.mockRejectedValue(cleanupError);

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
    // 原始的 insert 错误和 cleanup 错误都要能在开发环境的日志里看到，
    // cleanup 失败不能把 insert 失败这条更重要的错误盖掉。
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("post_images 批量写入失败"),
      expect.objectContaining({ code: "23505" })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("孤儿 Storage 文件清理失败"),
      expect.objectContaining({ code: "500" })
    );

    consoleErrorSpy.mockRestore();
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

  // 12 号卡：地区选择从原生下拉换成跳转 /region-select?mode=form + 回填
  // usePendingFormRegionStore（回填机制本身的单测在
  // pending-form-region-store.test.ts / region-select-page.test.tsx，
  // 这里只测 PublishPage 消费这个 store 之后的表现——不用真的渲染
  // RegionSelectPage，直接往 store 里写值，模拟"从那个页面选完回来"这一刻）。
  //
  // 原来"输入任意手动文字"的"其他（手动输入）"UI 已经被这个新流程取代——
  // 没有城市数据的州（大多数州）复用的正是同一个 OTHER_LOCATION_VALUE +
  // locationText 机制，只是 locationText 的值现在来自选中的州（格式化好的
  // "缩写 中文州名"），不是用户手打的任意文字，见 publish-page.tsx 消费
  // pendingRegion 的 effect 顶部注释。"OTHER_LOCATION_VALUE 但 locationText
  // 为空"这个校验分支现在在 UI 层已经不可达（effect 总是把两者一起设），
  // 那条校验规则本身仍然由 publish-validation.test.ts 直接测纯函数覆盖，
  // 不需要在这里再模拟一次不可达的路径。
  it("submits a state-only region (no city data) picked via /region-select as locationText, with a null locationId", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
    await screen.findByText("CA 加利福尼亚州");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: null,
          locationText: "CA 加利福尼亚州"
        })
      );
    });
  });

  it("submits a city-backed region (DC/VA/MD drilldown) picked via /region-select as locationId, with a null locationText", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });
    await screen.findByText("Arlington");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: "loc-arlington",
          locationText: null
        })
      );
    });
  });

  it("clears a picked region back to '不限地区' (locationId/locationText both null) when the clear button is clicked", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("option", { name: "租房" });

    fillRequiredFields();
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
    await screen.findByText("CA 加利福尼亚州");

    fireEvent.click(screen.getByRole("button", { name: "清除地区" }));
    expect(screen.getByText("不限地区")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: null,
          locationText: null
        })
      );
    });
  });
});

describe("PublishPage in edit mode", () => {
  afterEach(() => {
    cleanup();
  });

  const existingPostDetail = {
    id: "post-1",
    status: "pending",
    title: "Original title",
    description: "Original description that is long enough.",
    priceAmount: 500,
    priceLabel: null,
    currencyCode: "USD",
    categoryId: "cat-1",
    categoryName: "租房",
    locationId: "loc-1",
    locationText: null,
    locationName: "Rockville",
    createdAt: "2026-01-01T00:00:00.000Z",
    authorDisplayName: "Alice",
    contactMethod: "email",
    contactValue: "alice@example.com",
    images: [{ id: "img-1", publicUrl: "https://cdn.example.com/img-1.png", sortOrder: 0 }]
  };

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveCategories.mockReset();
    listActiveLocations.mockReset();
    createPost.mockReset();
    getPostDetail.mockReset();
    updatePost.mockReset();
    uploadPostImage.mockReset();
    removePostImageFiles.mockReset();
    insertPostImages.mockReset();
    removeOwnPostImage.mockReset();
    navigateMock.mockReset();
    usePendingFormRegionStore.setState(initialPendingRegionState, true);

    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listActiveLocations.mockResolvedValue([
      { id: "loc-1", name: "Rockville" }
    ]);
    insertPostImages.mockResolvedValue([]);
    removePostImageFiles.mockResolvedValue(undefined);
    useAuthStore.getState().setSession({
      user: { id: "user-1" }
    } as never);
  });

  function renderEditPage() {
    return renderWithProviders(<PublishPage />, {
      route: "/publish/:id",
      initialEntries: ["/publish/post-1"]
    });
  }

  it("loads the existing post via getPostDetail and pre-fills the form instead of showing a blank form", async () => {
    getPostDetail.mockResolvedValue(existingPostDetail);
    renderEditPage();

    expect(await screen.findByDisplayValue("Original title")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Original description that is long enough.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("分类")).toHaveValue("cat-1");
    // 地区字段不再是原生 <select>——展示文案直接复用服务端已经解析好的
    // locationName（见 publish-page.tsx 顶部注释），这里断言那行按钮上
    // 显示的文字，而不是某个表单控件的 value。
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(getPostDetail).toHaveBeenCalledWith("post-1");
  });

  it("shows a not-found/no-permission message instead of a blank create form when getPostDetail returns null", async () => {
    getPostDetail.mockResolvedValue(null);
    renderEditPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "帖子不存在，或没有权限编辑。"
    );
    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();
  });

  it("shows the post's free-text location (locationText) as the region field's display label when it used a custom location", async () => {
    getPostDetail.mockResolvedValue({
      ...existingPostDetail,
      locationId: null,
      locationText: "Somewhere custom",
      locationName: "Somewhere custom"
    });
    renderEditPage();

    await screen.findByDisplayValue("Original title");
    expect(screen.getByText("Somewhere custom")).toBeInTheDocument();
  });

  it("calls updatePost (not createPost) on submit, passing the loaded currentStatus", async () => {
    getPostDetail.mockResolvedValue(existingPostDetail);
    updatePost.mockResolvedValue(undefined);
    renderEditPage();

    await screen.findByDisplayValue("Original title");
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "Updated title" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(updatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: "post-1",
          currentStatus: "pending",
          title: "Updated title",
          locationId: "loc-1",
          locationText: null
        })
      );
    });
    expect(createPost).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/post/post-1", {
      replace: true,
      state: { publishSuccessMessage: "修改已保存" }
    });
  });

  it("renders already-uploaded images with a delete button and removes one via removeOwnPostImage", async () => {
    getPostDetail.mockResolvedValue(existingPostDetail);
    removeOwnPostImage.mockResolvedValue(undefined);
    renderEditPage();

    await screen.findByDisplayValue("Original title");
    expect(screen.getByText("已上传的图片")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(removeOwnPostImage).toHaveBeenCalledWith("img-1");
    });
    await waitFor(() => {
      expect(screen.queryByText("已上传的图片")).not.toBeInTheDocument();
    });
  });

  it("invalidates the posts/my-posts/favorited-posts list caches after removing an existing image (regression: 删图后首页缓存没刷新的问题)", async () => {
    getPostDetail.mockResolvedValue(existingPostDetail);
    removeOwnPostImage.mockResolvedValue(undefined);
    const { invalidateQueriesSpy } = renderWithSpyableQueryClient(<PublishPage />, {
      route: "/publish/:id",
      initialEntries: ["/publish/post-1"]
    });

    await screen.findByDisplayValue("Original title");
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(removeOwnPostImage).toHaveBeenCalledWith("img-1");
    });
    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["posts"] });
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["my-posts"] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["favorited-posts"] });
  });

  it("computes the new image's sort_order from the max active sort_order among existing images, not from how many are currently displayed (regression for the soft-delete collision bug)", async () => {
    // 模拟"曾经有 sort_order 0/1/2 三张图，1 被软删除"之后的状态：
    // 编辑页现在只展示 2 张（0 和 2），如果用旧算法
    // existingImages.length（=2）当起始值，新图会被分配 sort_order=2，
    // 正好撞上还活跃的那一张——这正是这次要修的 bug。新算法应该是
    // max(0, 2) + 1 = 3。
    getPostDetail.mockResolvedValue({
      ...existingPostDetail,
      images: [
        { id: "img-1", publicUrl: "https://cdn.example.com/img-1.png", sortOrder: 0 },
        { id: "img-3", publicUrl: "https://cdn.example.com/img-3.png", sortOrder: 2 }
      ]
    });
    updatePost.mockResolvedValue(undefined);
    uploadPostImage.mockResolvedValue({
      storagePath: "user-1/post-1/img-new.webp",
      publicUrl: "https://cdn.example.com/img-new.webp",
      mimeType: "image/webp",
      sizeBytes: 100
    });
    insertPostImages.mockResolvedValue([]);

    renderEditPage();
    await screen.findByDisplayValue("Original title");

    selectImages([makeImageFile("new.png")]);
    await screen.findByText("new.png");

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(insertPostImages).toHaveBeenCalledWith([
        expect.objectContaining({
          storagePath: "user-1/post-1/img-new.webp",
          sortOrder: 3
        })
      ]);
    });
  });

  it("only cleans up this batch's newly uploaded Storage files on insert failure, never the post's pre-existing images", async () => {
    getPostDetail.mockResolvedValue(existingPostDetail);
    updatePost.mockResolvedValue(undefined);
    uploadPostImage.mockResolvedValue({
      storagePath: "user-1/post-1/img-new.webp",
      publicUrl: "https://cdn.example.com/img-new.webp",
      mimeType: "image/webp",
      sizeBytes: 100
    });
    insertPostImages.mockRejectedValue({ message: "insert failed", code: "23505" });

    renderEditPage();
    await screen.findByDisplayValue("Original title");
    // 编辑页加载时已经有一张旧图（existingPostDetail.images 里的
    // img-1），这里再选一张新图触发失败路径。
    expect(screen.getByText("已上传的图片")).toBeInTheDocument();

    selectImages([makeImageFile("new.png")]);
    await screen.findByText("new.png");

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(removePostImageFiles).toHaveBeenCalledWith([
        "user-1/post-1/img-new.webp"
      ]);
    });
    // 只清理了这一批新上传的这一个 path，没有把旧图片（img-1 对应的
    // storage path）也传进去——旧图片本来就不在 successfulInputs 里，
    // 这里显式断言调用参数只有这一个元素，把这个保证钉死。
    expect(removePostImageFiles).toHaveBeenCalledTimes(1);
    expect(removePostImageFiles.mock.calls[0][0]).toHaveLength(1);
  });
});
