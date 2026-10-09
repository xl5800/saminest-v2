import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 编辑模式（/community/post/:id/edit）的测试，跟新建模式的
// create-community-post-page.test.tsx 分开放：这里需要 mock 详情查询和更新
// mutation，新建模式那份测试不需要。
const {
  useCommunityPostDetailQuery,
  useUpdateCommunityPostMutation,
  useCommunityBySlugQuery,
  useJoinCommunityMutation,
  useCreateCommunityPostMutation,
  updateMutateAsync,
  joinMutate,
  createMutateAsync,
  navigateMock
} = vi.hoisted(() => ({
  useCommunityPostDetailQuery: vi.fn(),
  useUpdateCommunityPostMutation: vi.fn(),
  useCommunityBySlugQuery: vi.fn(),
  useJoinCommunityMutation: vi.fn(),
  useCreateCommunityPostMutation: vi.fn(),
  updateMutateAsync: vi.fn(),
  joinMutate: vi.fn(),
  createMutateAsync: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../features/community/use-community-post-detail-query", () => ({
  useCommunityPostDetailQuery
}));
vi.mock("../../features/community/use-update-community-post-mutation", () => ({
  useUpdateCommunityPostMutation
}));
vi.mock("../../features/community/use-community-by-slug-query", () => ({ useCommunityBySlugQuery }));
vi.mock("../../features/community/use-join-community-mutation", () => ({
  useJoinCommunityMutation
}));
vi.mock("../../features/community/use-create-community-post-mutation", () => ({
  useCreateCommunityPostMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { CreateCommunityPostPage } from "./create-community-post-page";

const initialAuthState = useAuthStore.getState();

const existingPost = {
  id: "cp-1",
  communityId: "c-1",
  postType: "question",
  title: "原标题",
  body: "原正文",
  pinned: false,
  commentCount: 0,
  favoriteCount: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  authorId: "user-1",
  authorDisplayName: "Alice",
  authorAvatarUrl: null,
  coverImageUrl: null,
  images: []
};

function renderEdit() {
  return renderWithProviders(<CreateCommunityPostPage />, {
    initialEntries: ["/community/post/cp-1/edit"],
    route: "/community/post/:id/edit"
  });
}

describe("CreateCommunityPostPage (edit mode)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    navigateMock.mockReset();
    updateMutateAsync.mockReset();
    joinMutate.mockReset();
    createMutateAsync.mockReset();
    useCommunityPostDetailQuery.mockReset();
    useUpdateCommunityPostMutation.mockReset();

    useCommunityPostDetailQuery.mockReturnValue({
      data: existingPost,
      isPending: false,
      isError: false
    });
    useUpdateCommunityPostMutation.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isPending: false
    });
    useCommunityBySlugQuery.mockReturnValue({ data: { id: "c-1", name: "DMV 社区", slug: "dmv" } });
    useJoinCommunityMutation.mockReturnValue({
      mutate: joinMutate,
      mutateAsync: vi.fn(),
      isPending: false
    });
    useCreateCommunityPostMutation.mockReturnValue({
      mutateAsync: createMutateAsync,
      isPending: false
    });
  });

  it("enables the detail query with the route id, and shows the 编辑帖子 title and 保存修改 button", () => {
    renderEdit();

    expect(useCommunityPostDetailQuery).toHaveBeenCalledWith("cp-1", { enabled: true });
    expect(screen.getByRole("heading", { name: "编辑帖子" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存修改" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
  });

  it("pre-fills the form from the existing post", async () => {
    renderEdit();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("起个标题")).toHaveValue("原标题");
    });
    expect(screen.getByPlaceholderText("说点什么吧…")).toHaveValue("原正文");
  });

  it("only seeds once: a later background refetch does not overwrite what the user has typed", async () => {
    renderEdit();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("说点什么吧…")).toHaveValue("原正文");
    });

    fireEvent.change(screen.getByPlaceholderText("说点什么吧…"), {
      target: { value: "我改到一半的内容" }
    });
    // 模拟后台重新拉取：详情查询返回了一份新对象（内容也变了）。下一次渲染
    // （由接下来这次输入触发）会读到它，seededRef 应该挡住重复回填。
    useCommunityPostDetailQuery.mockReturnValue({
      data: { ...existingPost, title: "服务端后来变了", body: "服务端后来变了" },
      isPending: false,
      isError: false
    });
    fireEvent.change(screen.getByPlaceholderText("起个标题"), { target: { value: "我的标题" } });

    expect(screen.getByPlaceholderText("说点什么吧…")).toHaveValue("我改到一半的内容");
    expect(screen.getByPlaceholderText("起个标题")).toHaveValue("我的标题");
  });

  it("does not render the image picker or silently join the community in edit mode", () => {
    renderEdit();

    expect(screen.queryByText("添加图片")).not.toBeInTheDocument();
    expect(document.querySelector("#community-post-image-picker")).not.toBeInTheDocument();
    expect(joinMutate).not.toHaveBeenCalled();
  });

  it("saves via the update mutation (not create), then navigates back to the detail page", async () => {
    updateMutateAsync.mockResolvedValue(undefined);
    renderEdit();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("说点什么吧…")).toHaveValue("原正文");
    });

    fireEvent.change(screen.getByPlaceholderText("起个标题"), { target: { value: "  新标题  " } });
    fireEvent.change(screen.getByPlaceholderText("说点什么吧…"), { target: { value: "新正文" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "cp-1",
        authorId: "user-1",
        postType: "question",
        title: "新标题",
        body: "新正文"
      });
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/community/post/cp-1");
  });

  it("sends title: null when the title is cleared", async () => {
    updateMutateAsync.mockResolvedValue(undefined);
    renderEdit();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("起个标题")).toHaveValue("原标题");
    });

    fireEvent.change(screen.getByPlaceholderText("起个标题"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ title: null }));
    });
  });

  it("blocks saving an empty body and does not call the mutation", async () => {
    renderEdit();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("说点什么吧…")).toHaveValue("原正文");
    });

    fireEvent.change(screen.getByPlaceholderText("说点什么吧…"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请写点内容再发布。");
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("shows a save-specific error (not the publish one) and stays on the page when the update fails", async () => {
    updateMutateAsync.mockRejectedValue(new Error("boom"));
    renderEdit();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("说点什么吧…")).toHaveValue("原正文");
    });

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请稍后重试。");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the account-restricted message verbatim when the update is rejected for a restricted account", async () => {
    updateMutateAsync.mockRejectedValue(new AppError("账号受限提示", "ACCOUNT_RESTRICTED"));
    renderEdit();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("说点什么吧…")).toHaveValue("原正文");
    });

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("账号受限提示");
  });

  it("shows a loading state and no form while the existing post is loading", () => {
    useCommunityPostDetailQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false
    });

    renderEdit();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
    expect(screen.queryByPlaceholderText("说点什么吧…")).not.toBeInTheDocument();
  });

  it("shows 帖子不存在，或没有权限编辑 and no form when the post query fails", () => {
    useCommunityPostDetailQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true
    });

    renderEdit();

    expect(screen.getByRole("alert")).toHaveTextContent("帖子不存在，或没有权限编辑。");
    expect(screen.queryByPlaceholderText("说点什么吧…")).not.toBeInTheDocument();
  });

  it("shows 帖子不存在，或没有权限编辑 and no form when the post belongs to someone else", () => {
    useCommunityPostDetailQuery.mockReturnValue({
      data: { ...existingPost, authorId: "someone-else" },
      isPending: false,
      isError: false
    });

    renderEdit();

    expect(screen.getByRole("alert")).toHaveTextContent("帖子不存在，或没有权限编辑。");
    expect(screen.queryByPlaceholderText("说点什么吧…")).not.toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });
});

describe("CreateCommunityPostPage (create mode) detail-query gating", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not enable the detail query when there is no :id in the route", () => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useCommunityPostDetailQuery.mockReset();
    useCommunityPostDetailQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false
    });
    useUpdateCommunityPostMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCommunityBySlugQuery.mockReturnValue({ data: { id: "c-1", name: "DMV 社区", slug: "dmv" } });
    useJoinCommunityMutation.mockReturnValue({
      mutate: joinMutate,
      mutateAsync: vi.fn(),
      isPending: false
    });
    useCreateCommunityPostMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    // 新建模式（带 slug 的入口）：路由里没有 :id。
    renderWithProviders(<CreateCommunityPostPage />, {
      initialEntries: ["/community/dmv/new"],
      route: "/community/:slug/new"
    });

    expect(useCommunityPostDetailQuery).toHaveBeenCalledWith("", { enabled: false });
    expect(screen.getByRole("heading", { name: "发布到社区" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeInTheDocument();
  });
});
