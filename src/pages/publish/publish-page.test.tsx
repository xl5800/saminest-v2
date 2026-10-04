import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listActiveCategories,
  listActiveLocations,
  listActiveActivityRegions,
  createPost,
  getPostDetail,
  updatePost,
  uploadPostImage,
  removePostImageFiles,
  insertPostImages,
  removeOwnPostImage,
  getMyProfile,
  navigateMock
} = vi.hoisted(() => ({
  listActiveCategories: vi.fn(),
  listActiveLocations: vi.fn(),
  // design_handoff_saminest_ios 第 6 项：所在州字段现在跟 create-
  // activity-page.tsx 一样，靠这个反查函数把 stateCode 解析成真实的
  // locations.id（见 publish-page.tsx 消费 pendingRegion 的 effect），
  // 不再需要时另外 mock 一遍——跟 listActiveLocations 一样直接放进这个
  // 模块级 mock 里。
  listActiveActivityRegions: vi.fn(),
  createPost: vi.fn(),
  getPostDetail: vi.fn(),
  updatePost: vi.fn(),
  uploadPostImage: vi.fn(),
  removePostImageFiles: vi.fn(),
  insertPostImages: vi.fn(),
  removeOwnPostImage: vi.fn(),
  // 31 号卡：年龄自动填充读的 useMyProfileQuery() 底层就是这个 repository
  // 函数（见 use-my-profile-query.ts），照抄 profile-page.test.tsx 已有的
  // mock 方式，不重新发明一套。
  getMyProfile: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/locations-repository", () => ({
  listActiveLocations,
  listActiveActivityRegions
}));
vi.mock("../../repositories/posts-repository", () => ({
  createPost,
  getPostDetail,
  updatePost
}));
vi.mock("../../repositories/profiles-repository", () => ({
  getMyProfile
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
import { usePendingPostFormDraftStore } from "../../store/pending-post-form-draft-store";
import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { PublishPage } from "./publish-page";

const initialAuthState = useAuthStore.getState();
const initialPendingRegionState = usePendingFormRegionStore.getState();
const initialPendingPostDraftState = usePendingPostFormDraftStore.getState();

// 发布页简化改版（任务卡 7）：分类从 <select> 改成 role="radiogroup" 里的
// 胶囊 tab 按钮（role="radio"），没有独立的"标题"输入框了，title 从描述
// 第一行派生。下面两个常量/helper 是这套新交互的统一入口。
const SAMPLE_TITLE = "Sunny room near metro";
const SAMPLE_BODY = "A description that is definitely long enough.";
const SAMPLE_DESCRIPTION = SAMPLE_TITLE + "\n" + SAMPLE_BODY;

function selectCategory(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

function fillDescription(value: string) {
  fireEvent.change(screen.getByLabelText("描述"), { target: { value } });
}

function fillRequiredFields() {
  selectCategory("租房");
  fillDescription(SAMPLE_DESCRIPTION);
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
    listActiveActivityRegions.mockReset();
    createPost.mockReset();
    getPostDetail.mockReset();
    updatePost.mockReset();
    uploadPostImage.mockReset();
    removePostImageFiles.mockReset();
    insertPostImages.mockReset();
    removeOwnPostImage.mockReset();
    getMyProfile.mockReset();
    navigateMock.mockReset();
    usePendingFormRegionStore.setState(initialPendingRegionState, true);
    // 27 号卡：新增的草稿 store 同理要在每个测试之间重置——不然某个测试
    // 点击了"选择地区"（会往这个 store 里存一份草稿），下一个测试挂载
    // PublishPage 时会读到上一个测试留下的草稿，误判成"已经 seed 过"。
    usePendingPostFormDraftStore.setState(initialPendingPostDraftState, true);

    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listActiveLocations.mockResolvedValue([
      { id: "loc-1", name: "Rockville" }
    ]);
    // design_handoff_saminest_ios 第 6 项：默认给几个测试里会用到的州
    // 都准备好反查用的 locations.id——具体测试如果需要断言别的州，
    // 会在自己内部覆盖一遍这个 mock。
    listActiveActivityRegions.mockResolvedValue([
      { id: "loc-ca", name: "CA", stateCode: "CA" }
    ]);
    insertPostImages.mockResolvedValue([]);
    removePostImageFiles.mockResolvedValue(undefined);
    // 31 号卡：默认没有年龄——大部分用例根本不是求租分类，这个 query 压根
    // 不会被消费；求租分类的年龄自动填充测试单独覆盖一遍非 null 的情况。
    getMyProfile.mockResolvedValue({ age: null });
    useAuthStore.getState().setSession({
      user: { id: "user-1" }
    } as never);
  });

  it("renders category options loaded from the database, not hardcoded", async () => {
    renderWithProviders(<PublishPage />);

    expect(
      await screen.findByRole("radio", { name: "租房" })
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
    await screen.findByRole("radio", { name: "租房" });

    expect(screen.getByText("不限地区")).toBeInTheDocument();
    fireEvent.click(screen.getByText("不限地区"));

    expect(navigateMock).toHaveBeenCalledWith("/region-select?mode=form");
  });

  it("preselects the category from a ?category=<slug> query param (used by the publish action sheet's 发布租房/求租/二手 entries)", async () => {
    renderWithProviders(<PublishPage />, { initialEntries: ["/publish?category=rent"] });

    await screen.findByRole("radio", { name: "租房" });

    expect(screen.getByRole("radio", { name: "租房" })).toBeChecked();
  });

  it("leaves the category blank when ?category=<slug> does not match any loaded category", async () => {
    renderWithProviders(<PublishPage />, {
      initialEntries: ["/publish?category=not-a-real-slug"]
    });

    await screen.findByRole("radio", { name: "租房" });

    expect(screen.getByRole("radio", { name: "租房" })).not.toBeChecked();
  });

  // ---- 发布页简化改版（任务卡 7）------------------------------------------

  it("renders the category as a radiogroup of pill tab buttons (single choice) instead of a <select>", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" },
      { id: "cat-3", slug: "used", nameZh: "二手" }
    ]);
    renderWithProviders(<PublishPage />);

    const group = await screen.findByRole("radiogroup", { name: "分类" });
    // radiogroup 在分类数据返回之前就已经渲染（里面是空的），等第一个
    // radio 出现再断言整组。
    await screen.findByRole("radio", { name: "租房" });
    expect(group.tagName).not.toBe("SELECT");
    expect(screen.queryByRole("combobox", { name: "分类" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "租房",
      "求租",
      "二手"
    ]);

    selectCategory("求租");
    expect(screen.getByRole("radio", { name: "求租" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "租房" })).not.toBeChecked();

    // 单选：再点另一个，上一个取消选中。
    selectCategory("二手");
    expect(screen.getByRole("radio", { name: "二手" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "求租" })).not.toBeChecked();
  });

  it("styles the selected category tab with a primary background and the unselected ones with a light background", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" }
    ]);
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    selectCategory("租房");

    expect(screen.getByRole("radio", { name: "租房" }).className).toMatch(/\bbg-primary\b/);
    expect(screen.getByRole("radio", { name: "租房" }).className).toMatch(/\btext-white\b/);
    expect(screen.getByRole("radio", { name: "求租" }).className).not.toMatch(/\bbg-primary\b/);
    expect(screen.getByRole("radio", { name: "求租" }).className).toMatch(/\btext-text-muted\b/);
  });

  it("no longer renders a separate 标题 input, and the 描述 textarea hints that its first line becomes the title", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    expect(screen.queryByLabelText("标题")).not.toBeInTheDocument();
    expect(screen.getByLabelText("描述")).toHaveAttribute(
      "placeholder",
      "第一行将作为标题…详细说说你的帖子"
    );
  });

  it("no longer renders the 联系方式 type/content controls, nor the 拍照 button", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    expect(screen.queryByLabelText("联系方式类型")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("联系方式内容")).not.toBeInTheDocument();
    expect(screen.queryByText("拍照")).not.toBeInTheDocument();
    expect(document.querySelector("input[capture]")).toBeNull();
  });

  it("orders the form as 分类 → 图片 → 描述 → 价格 → 所在州 → 城市/具体位置", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    const nodes = [
      screen.getByRole("radiogroup", { name: "分类" }),
      screen.getByLabelText(/上传图片/),
      screen.getByLabelText("描述"),
      screen.getByLabelText("价格（可选）"),
      screen.getByText("所在州"),
      screen.getByLabelText("城市 / 具体位置（可选）")
    ];
    for (let index = 0; index < nodes.length - 1; index += 1) {
      expect(
        nodes[index].compareDocumentPosition(nodes[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it("places the 求租-only 性别/年龄 fields below the description and above the price", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" }
    ]);
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });
    selectCategory("求租");

    const description = screen.getByLabelText("描述");
    const gender = await screen.findByLabelText("性别（可选）");
    const age = screen.getByLabelText("年龄（可选）");
    const price = screen.getByLabelText("价格（可选）");
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(description.compareDocumentPosition(gender) & following).toBeTruthy();
    expect(gender.compareDocumentPosition(age) & following).toBeTruthy();
    expect(age.compareDocumentPosition(price) & following).toBeTruthy();
  });

  it("derives the title from the first line (trimmed) and truncates it to 120 characters, while description keeps the full text", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    const longFirstLine = "a".repeat(150);
    selectCategory("租房");
    fillDescription(longFirstLine + "\n第二行");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "a".repeat(120),
          description: longFirstLine + "\n第二行"
        })
      );
    });
  });

  it("always submits contact_method 'message' and contact_value null", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({ contactMethod: "message", contactValue: null })
      );
    });
  });

  it("allows a single-line post (title only, no extra body)", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    selectCategory("租房");
    fillDescription("只有一行标题");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: "只有一行标题", description: "只有一行标题" })
      );
    });
  });

  it("does not render any field for author_id or status", () => {
    renderWithProviders(<PublishPage />);

    expect(screen.queryByLabelText(/作者/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/状态/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  // 发布页简化改版（任务卡 7）：title 从描述第一行派生，整段描述为空（或只有
  // 空白）时派生出来的 title 也是空——必须在前端拦住，不能让空 title 提交
  // 到数据库。
  it("blocks submission with a '请至少写点什么' message when the description (and so the derived title) is empty", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    selectCategory("租房");
    fillDescription("   \n  ");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请至少写点什么。");
    expect(createPost).not.toHaveBeenCalled();
  });

  it("blocks submission when no category is selected", async () => {
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    fillDescription(SAMPLE_DESCRIPTION);
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请选择分类。");
    expect(createPost).not.toHaveBeenCalled();
  });

  it("submits author_id from the auth store and hardcodes status to pending via createPost, then redirects with a success message", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith({
        authorId: "user-1",
        categoryId: "cat-1",
        locationId: null,
        locationText: null,
        // title 从描述第一行派生，description 保存完整原文（标题行不剔除）；
        // 联系方式固定站内私信。
        title: SAMPLE_TITLE,
        description: SAMPLE_DESCRIPTION,
        priceAmount: null,
        contactMethod: "message",
        contactValue: null,
        posterAge: null,
        posterGender: null
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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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
    await screen.findByRole("radio", { name: "租房" });

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

  // design_handoff_saminest_ios 第 6 项：地区选择从原生下拉换成跳转
  // /region-select?mode=form + 回填 usePendingFormRegionStore（回填机制
  // 本身的单测在 pending-form-region-store.test.ts /
  // region-select-page.test.tsx，这里只测 PublishPage 消费这个 store 之后
  // 的表现——不用真的渲染 RegionSelectPage，直接往 store 里写值，模拟
  // "从那个页面选完回来"这一刻）。
  //
  // 12 号卡时期"没有城市数据的州复用 OTHER_LOCATION_VALUE + locationText
  // 兜底"的写法已经被第 6 项取代——51 州现在在 locations 表里都有真实的
  // type='state' 行，选中的州直接通过 regionsByStateCode 反查出真正的
  // locations.id 提交，不再把州名字符串硬塞进 locationText（见
  // publish-page.tsx 消费 pendingRegion 的 effect 顶部注释）。locationText
  // 现在是"城市/具体位置"这个独立输入框的值，跟"所在州"是两个不互斥的
  // 字段，下面单独一条用例覆盖两者同时存在的情况。
  it("submits a state picked via /region-select as locationId, resolved through regionsByStateCode", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

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
          locationId: "loc-ca",
          locationText: null
        })
      );
    });
  });

  // design_handoff_saminest_ios 第 6 项 gap #2：验证"所在州"和"城市/
  // 具体位置"现在是两个可以同时提交的独立字段，不再是互斥的"选了州就等于
  // locationText"关系。
  it("submits both a resolved locationId and a user-typed locationText together when both fields are filled", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("城市 / 具体位置（可选）"), {
      target: { value: "近地铁站" }
    });
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
    await screen.findByText("CA 加利福尼亚州");

    // 选州这一步不应该把刚才手打的"城市/具体位置"清空。
    expect(screen.getByLabelText("城市 / 具体位置（可选）")).toHaveValue("近地铁站");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: "loc-ca",
          locationText: "近地铁站"
        })
      );
    });
  });

  it("submits a city-backed region (DC/VA/MD drilldown) picked via /region-select as locationId, with a null locationText", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

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

  it("clears a picked region back to '不限地区' (locationId null) when the clear button is clicked, without touching locationText", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithProviders(<PublishPage />);
    await screen.findByRole("radio", { name: "租房" });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("城市 / 具体位置（可选）"), {
      target: { value: "近地铁站" }
    });
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
    await screen.findByText("CA 加利福尼亚州");

    fireEvent.click(screen.getByRole("button", { name: "清除地区" }));
    expect(screen.getByText("不限地区")).toBeInTheDocument();
    // design_handoff_saminest_ios 第 6 项：清空"所在州"不应该连带清空
    // 用户在"城市/具体位置"里打的字——两个字段现在互不依赖，见
    // handleClearRegion 顶部注释。
    expect(screen.getByLabelText("城市 / 具体位置（可选）")).toHaveValue("近地铁站");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          locationId: null,
          locationText: "近地铁站"
        })
      );
    });
  });

  // 31 号卡（求租板块改版）：性别/年龄这两个字段只在求租分类下渲染，见
  // publish-page.tsx 顶部对应注释。
  describe("求租分类专属的性别/年龄字段", () => {
    beforeEach(() => {
      listActiveCategories.mockResolvedValue([
        { id: "cat-1", slug: "rent", nameZh: "租房" },
        { id: "cat-2", slug: "wanted", nameZh: "求租" }
      ]);
    });

    it("does not render the gender/age fields when the selected category is not 求租", async () => {
      renderWithProviders(<PublishPage />);
      await screen.findByRole("radio", { name: "租房" });

      selectCategory("租房");

      expect(screen.queryByLabelText("性别（可选）")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("年龄（可选）")).not.toBeInTheDocument();
    });

    it("renders the gender/age fields once the 求租 category is selected", async () => {
      renderWithProviders(<PublishPage />);
      await screen.findByRole("radio", { name: "租房" });

      selectCategory("求租");

      expect(screen.getByLabelText("性别（可选）")).toBeInTheDocument();
      expect(screen.getByLabelText("年龄（可选）")).toBeInTheDocument();
    });

    it("auto-fills the age field once from the current user's profile.age when 求租 is selected", async () => {
      getMyProfile.mockResolvedValue({ age: 28 });
      renderWithProviders(<PublishPage />);
      await screen.findByRole("radio", { name: "租房" });

      selectCategory("求租");

      await waitFor(() => {
        expect(screen.getByLabelText("年龄（可选）")).toHaveValue(28);
      });
    });

    it("does not overwrite a manually edited age with profile.age after the first auto-fill", async () => {
      getMyProfile.mockResolvedValue({ age: 28 });
      renderWithProviders(<PublishPage />);
      await screen.findByRole("radio", { name: "租房" });

      selectCategory("求租");
      await waitFor(() => {
        expect(screen.getByLabelText("年龄（可选）")).toHaveValue(28);
      });

      fireEvent.change(screen.getByLabelText("年龄（可选）"), { target: { value: "35" } });
      // 切走求租分类再切回来，不应该把用户刚改的 35 冲回 profile 的 28——
      // ageAutoFilledRef 只允许自动填充生效一次。
      selectCategory("租房");
      selectCategory("求租");

      expect(screen.getByLabelText("年龄（可选）")).toHaveValue(35);
    });

    it("leaves the age field blank (does not auto-fill) when profile.age is null", async () => {
      getMyProfile.mockResolvedValue({ age: null });
      renderWithProviders(<PublishPage />);
      await screen.findByRole("radio", { name: "租房" });

      selectCategory("求租");

      await screen.findByLabelText("年龄（可选）");
      expect(screen.getByLabelText("年龄（可选）")).toHaveValue(null);
    });

    it("submits posterAge/posterGender when the 求租 category is selected and the fields are filled", async () => {
      createPost.mockResolvedValue({ id: "post-999" });
      renderWithProviders(<PublishPage />);
      await screen.findByRole("radio", { name: "租房" });

      selectCategory("求租");
      fillDescription("Looking for a room\n" + SAMPLE_BODY);
      fireEvent.change(screen.getByLabelText("性别（可选）"), { target: { value: "男" } });
      fireEvent.change(screen.getByLabelText("年龄（可选）"), { target: { value: "30" } });

      fireEvent.click(screen.getByRole("button", { name: "发布" }));

      await waitFor(() => {
        expect(createPost).toHaveBeenCalledWith(
          expect.objectContaining({ posterAge: 30, posterGender: "男" })
        );
      });
    });

    it("submits posterAge/posterGender as null when the category is switched away from 求租 after the fields were filled", async () => {
      createPost.mockResolvedValue({ id: "post-999" });
      renderWithProviders(<PublishPage />);
      await screen.findByRole("radio", { name: "租房" });

      selectCategory("求租");
      fireEvent.change(screen.getByLabelText("性别（可选）"), { target: { value: "男" } });
      fireEvent.change(screen.getByLabelText("年龄（可选）"), { target: { value: "30" } });
      // 切回非求租分类——性别/年龄输入框随之不再渲染，但底层 state 值仍然
      // 留着，提交时必须被当成没填。
      selectCategory("租房");
      fillDescription(SAMPLE_DESCRIPTION);

      fireEvent.click(screen.getByRole("button", { name: "发布" }));

      await waitFor(() => {
        expect(createPost).toHaveBeenCalledWith(
          expect.objectContaining({ posterAge: null, posterGender: null })
        );
      });
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
    // design_handoff_saminest_ios 第 6 项：regionLabel 回填现在读的是这个
    // 字段（联表结果本身），不再是 locationName（见 publish-page.tsx 里
    // regionLabel 回填那段注释）——真实接口的 getPostDetail() 会一起带上
    // 这两个字段，这里的 fixture 跟着补上，不然"所在州"按钮会显示成
    // "不限地区"。
    locationJoinedName: "Rockville",
    createdAt: "2026-01-01T00:00:00.000Z",
    authorDisplayName: "Alice",
    contactMethod: "email",
    contactValue: "alice@example.com",
    // 31 号卡：默认这份 fixture 走的是"租房"分类，两个字段留 null——跟真实
    // 数据一致（非求租帖子这两列本来就是 null）。求租分类的编辑回填单独用
    // 下面的 posterAge/posterGender 测试覆盖，不复用这份默认 fixture。
    posterAge: null,
    posterGender: null,
    images: [{ id: "img-1", publicUrl: "https://cdn.example.com/img-1.png", sortOrder: 0 }]
  };

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveCategories.mockReset();
    listActiveLocations.mockReset();
    listActiveActivityRegions.mockReset();
    createPost.mockReset();
    getPostDetail.mockReset();
    updatePost.mockReset();
    uploadPostImage.mockReset();
    removePostImageFiles.mockReset();
    insertPostImages.mockReset();
    removeOwnPostImage.mockReset();
    getMyProfile.mockReset();
    navigateMock.mockReset();
    usePendingFormRegionStore.setState(initialPendingRegionState, true);
    // 27 号卡：新增的草稿 store 同理要在每个测试之间重置——不然某个测试
    // 点击了"选择地区"（会往这个 store 里存一份草稿），下一个测试挂载
    // PublishPage 时会读到上一个测试留下的草稿，误判成"已经 seed 过"。
    usePendingPostFormDraftStore.setState(initialPendingPostDraftState, true);

    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" }
    ]);
    listActiveLocations.mockResolvedValue([
      { id: "loc-1", name: "Rockville" }
    ]);
    listActiveActivityRegions.mockResolvedValue([
      { id: "loc-ca", name: "CA", stateCode: "CA" }
    ]);
    insertPostImages.mockResolvedValue([]);
    removePostImageFiles.mockResolvedValue(undefined);
    // 31 号卡：默认没有年龄——大部分用例根本不是求租分类，这个 query 压根
    // 不会被消费；求租分类的年龄自动填充测试单独覆盖一遍非 null 的情况。
    getMyProfile.mockResolvedValue({ age: null });
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

    // 历史帖子（title 单独填、不在 description 里）回填描述框时，原标题会被
    // 补成第一行，见 publish-validation.ts 的 composeEditableDescription。
    expect(await screen.findByLabelText("描述")).toHaveValue(
      "Original title\nOriginal description that is long enough."
    );
    expect(screen.getByRole("radio", { name: "租房" })).toBeChecked();
    // 地区字段不再是原生 <select>——展示文案直接复用服务端已经解析好的
    // locationName（见 publish-page.tsx 顶部注释），这里断言那行按钮上
    // 显示的文字，而不是某个表单控件的 value。
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(getPostDetail).toHaveBeenCalledWith("post-1");
  });

  // 发布页简化改版（任务卡 7）：新格式的帖子（description 第一行本来就是
  // title）原样回填；重新保存后 title/description 保持一致，不会越存越长。
  it("restores a new-format post's description unchanged (its first line already equals the title), and re-saving keeps title and description stable", async () => {
    getPostDetail.mockResolvedValue({
      ...existingPostDetail,
      title: "新格式标题",
      description: "新格式标题\n这是正文"
    });
    updatePost.mockResolvedValue(undefined);
    renderEditPage();

    expect(await screen.findByLabelText("描述")).toHaveValue("新格式标题\n这是正文");

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => {
      expect(updatePost).toHaveBeenCalledWith(
        expect.objectContaining({ title: "新格式标题", description: "新格式标题\n这是正文" })
      );
    });
  });

  // 历史帖子（title 单独填、不在 description 里）：直接回填原 description 会让
  // 重新提交后的 title 悄悄变成描述第一行——回填时要把原标题补成第一行。
  it("keeps a legacy post's original title when re-saved without edits (title is prepended as the first line of the textarea)", async () => {
    getPostDetail.mockResolvedValue(existingPostDetail);
    updatePost.mockResolvedValue(undefined);
    renderEditPage();

    await screen.findByDisplayValue(/Original title/);
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(updatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Original title",
          description: "Original title\nOriginal description that is long enough."
        })
      );
    });
  });

  it("shows a not-found/no-permission message instead of a blank create form when getPostDetail returns null", async () => {
    getPostDetail.mockResolvedValue(null);
    renderEditPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "帖子不存在，或没有权限编辑。"
    );
    expect(screen.queryByLabelText("描述")).not.toBeInTheDocument();
  });

  it("shows the post's free-text location (locationText) as the region field's display label when it used a custom location", async () => {
    getPostDetail.mockResolvedValue({
      ...existingPostDetail,
      locationId: null,
      locationText: "Somewhere custom",
      locationName: "Somewhere custom",
      // 这条历史遗留数据没有真实的 locations 外键，联表结果本身自然是
      // null——显式覆盖掉从 existingPostDetail 继承来的 "Rockville"，
      // 不然 regionLabel 回填逻辑会误用那个值（见 publish-page.tsx 里
      // regionLabel 回填那段注释里"历史遗留『其他』分支"的说明）。
      locationJoinedName: null
    });
    renderEditPage();

    await screen.findByDisplayValue(/Original title/);
    expect(screen.getByText("Somewhere custom")).toBeInTheDocument();
  });

  it("calls updatePost (not createPost) on submit, passing the loaded currentStatus", async () => {
    getPostDetail.mockResolvedValue(existingPostDetail);
    updatePost.mockResolvedValue(undefined);
    renderEditPage();

    await screen.findByDisplayValue(/Original title/);
    fillDescription("Updated title\nOriginal description that is long enough.");
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(updatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: "post-1",
          currentStatus: "pending",
          title: "Updated title",
          description: "Updated title\nOriginal description that is long enough.",
          // 编辑保存同样固定站内私信（existingPostDetail 里原来的 email 联系
          // 方式会被覆盖掉）。
          contactMethod: "message",
          contactValue: null,
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

    await screen.findByDisplayValue(/Original title/);
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

    await screen.findByDisplayValue(/Original title/);
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
    await screen.findByDisplayValue(/Original title/);

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
    await screen.findByDisplayValue(/Original title/);
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

  // 31 号卡：编辑模式回填 posterAge/posterGender 用帖子自己保存的值，
  // 不是当前 profiles.age——即使 getMyProfile 返回一个不同的年龄，也不能
  // 覆盖帖子已经保存好的值，见 publish-page.tsx 顶部注释。
  it("seeds posterAge/posterGender from the existing post's own saved values, not from the current profile.age (31 号卡)", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" }
    ]);
    getMyProfile.mockResolvedValue({ age: 99 });
    getPostDetail.mockResolvedValue({
      ...existingPostDetail,
      categoryId: "cat-2",
      categoryName: "求租",
      posterAge: 27,
      posterGender: "不透露"
    });
    renderEditPage();

    await screen.findByDisplayValue(/Original title/);

    expect(screen.getByLabelText("年龄（可选）")).toHaveValue(27);
    expect(screen.getByLabelText("性别（可选）")).toHaveValue("不透露");
  });

  it("submits the post's own edited posterAge/posterGender via updatePost", async () => {
    listActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "rent", nameZh: "租房" },
      { id: "cat-2", slug: "wanted", nameZh: "求租" }
    ]);
    getPostDetail.mockResolvedValue({
      ...existingPostDetail,
      categoryId: "cat-2",
      categoryName: "求租",
      posterAge: 27,
      posterGender: "不透露"
    });
    updatePost.mockResolvedValue(undefined);
    renderEditPage();

    await screen.findByDisplayValue(/Original title/);
    fireEvent.change(screen.getByLabelText("年龄（可选）"), { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(updatePost).toHaveBeenCalledWith(
        expect.objectContaining({ posterAge: 31, posterGender: "不透露" })
      );
    });
  });
});
