import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Location } from "react-router-dom";

const {
  useFavoritePostIdsQuery,
  useToggleFavoriteMutation,
  usePostAuthorQuery,
  useCreateDirectConversationMutation,
  usePostDetailQuery,
  usePostCommentsQuery,
  useCreateCommentMutation,
  useDeleteCommentMutation,
  shareMock
} = vi.hoisted(() => ({
  useFavoritePostIdsQuery: vi.fn(),
  useToggleFavoriteMutation: vi.fn(),
  usePostAuthorQuery: vi.fn(),
  useCreateDirectConversationMutation: vi.fn(),
  usePostDetailQuery: vi.fn(),
  usePostCommentsQuery: vi.fn(),
  useCreateCommentMutation: vi.fn(),
  useDeleteCommentMutation: vi.fn(),
  shareMock: vi.fn()
}));

// PostDetailPage renders FavoriteButton and ContactSellerButton, which pull in
// useQuery/useMutation hooks of their own — mock those the same way
// favorite-button.test.tsx / contact-seller-button.test.tsx do so this file
// stays focused on the page's own rendering behavior.
vi.mock("../../features/favorites/use-favorite-post-ids-query", () => ({
  useFavoritePostIdsQuery
}));
vi.mock("../../features/favorites/use-toggle-favorite-mutation", () => ({
  useToggleFavoriteMutation
}));
vi.mock("../../features/posts/use-post-author-query", () => ({
  usePostAuthorQuery
}));
vi.mock("../../features/conversations/use-create-direct-conversation-mutation", () => ({
  useCreateDirectConversationMutation
}));
vi.mock("../../features/posts/use-post-detail-query", () => ({
  usePostDetailQuery
}));
// PostDetailPage also renders CommentSection (which recursively renders
// CommentItem for each comment) — mock those hooks too so this file stays
// focused on the page's own rendering behavior; CommentSection/CommentItem
// get their own dedicated test files.
vi.mock("../../features/comments/use-post-comments-query", () => ({
  usePostCommentsQuery
}));
vi.mock("../../features/comments/use-create-comment-mutation", () => ({
  useCreateCommentMutation
}));
vi.mock("../../features/comments/use-delete-comment-mutation", () => ({
  useDeleteCommentMutation
}));
vi.mock("@capacitor/share", () => ({
  Share: { share: shareMock }
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { PostDetailPage } from "./post-detail-page";

function renderAtWithState(path: string, state: unknown) {
  const entry: Partial<Location> = { pathname: path, state };
  return render(
    <MemoryRouter initialEntries={[entry as never]}>
      <Routes>
        <Route path="/post/:id" element={<PostDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const samplePostDetail = {
  id: "post-1",
  title: "Sunny room near metro",
  description: "A lovely room near the metro, walking distance to everything.",
  priceAmount: 1200,
  priceLabel: null,
  currencyCode: "USD",
  categoryName: "租房",
  locationName: "Rockville",
  createdAt: "2000-07-01T00:00:00.000Z",
  authorDisplayName: "Alice",
  contactMethod: "email",
  contactValue: "alice@example.com",
  images: [
    { id: "img-1", publicUrl: "https://img.example.com/1.jpg", sortOrder: 0 },
    { id: "img-2", publicUrl: "https://img.example.com/2.jpg", sortOrder: 1 }
  ],
  commentCount: 0
};

describe("PostDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useFavoritePostIdsQuery.mockReset();
    useToggleFavoriteMutation.mockReset();
    usePostAuthorQuery.mockReset();
    useCreateDirectConversationMutation.mockReset();
    usePostDetailQuery.mockReset();
    usePostCommentsQuery.mockReset();
    useCreateCommentMutation.mockReset();
    useDeleteCommentMutation.mockReset();
    shareMock.mockReset();
    shareMock.mockResolvedValue(undefined);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });
    useToggleFavoriteMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    // 默认查询已解析完成、且作者不是当前登录用户，让 ContactSellerButton
    // 正常渲染，避免每个测试都要各自重复这段 mock。
    usePostAuthorQuery.mockReturnValue({ data: "some-other-author", isSuccess: true });
    useCreateDirectConversationMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false
    });
    // CommentSection 默认没有评论、不在加载中，这个文件的测试只关心
    // PostDetailPage 自己的渲染行为，评论区的详细行为由
    // comment-section.test.tsx / comment-item.test.tsx 覆盖。
    usePostCommentsQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    useCreateCommentMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDeleteCommentMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows a loading message while the post detail query is pending", () => {
    usePostDetailQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    // getAllByRole, not getByRole: CommentSection also renders its own
    // role="status" element (its empty-comments message), so this page can
    // have more than one status element at once — the first one is this
    // page's own "加载中…" for the post detail query itself.
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("加载中…");
  });

  // 21 号卡（二级页面顶部栏简化）：顶部栏换成 TopBar 的 nav-only 变体，
  // 不再是全局 AppHeader 的"← Saminest 发布"——跟
  // region-select-page.test.tsx "renders the nav-only TopBar..." 是同一个
  // 断言模式。这个页面本来就没有额外的"页面名称"标题（标题就是帖子标题
  // 本身），所以这里不需要像"我的活动"/"我的收藏"那样再断言一个页面内
  // <h1>。
  it("renders the nav-only TopBar (back arrow only, no title/brand/publish text), even while the post detail query is pending", () => {
    usePostDetailQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
  });

  it("shows a friendly not-found message, without leaking whether the post exists but is unapproved, when the query resolves to null", () => {
    usePostDetailQuery.mockReturnValue({ data: null, isPending: false, isError: false });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("heading", { name: "帖子未找到" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("帖子不存在或未通过审核。");
  });

  it("shows a plain error message on a genuine fetch failure", () => {
    usePostDetailQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("alert")).toHaveTextContent("帖子加载失败，请稍后重试。");
  });

  it("renders the full post content — title, description, price, category, location, date, author, contact info and all images", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(
      screen.getByRole("heading", { name: "Sunny room near metro" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A lovely room near the metro, walking distance to everything."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("USD 1,200")).toBeInTheDocument();
    expect(screen.getByText("租房")).toBeInTheDocument();
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("2000-07-01")).toBeInTheDocument();
    expect(screen.getByText("发布者：Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "https://img.example.com/1.jpg");
    expect(images[1]).toHaveAttribute("src", "https://img.example.com/2.jpg");
  });

  // 改版之后价格在标题上方（放大突出），不再是"标题在最上面"——用
  // compareDocumentPosition 断言价格文本节点在标题 <h1> 之前，而不是只
  // 断言两者都存在（存在性已经被上面那条测试覆盖了）。
  it("renders the price above the title (P0 layout reorder: image → price → title → description → secondary info)", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    const price = screen.getByText("USD 1,200");
    const title = screen.getByRole("heading", { name: "Sunny room near metro" });

    // Node.DOCUMENT_POSITION_FOLLOWING (4): title 在 price 之后。
    expect(price.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders a horizontally scrollable image carousel (not a two-column grid) with a '1 / 2' counter that updates on scroll", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    const carousel = screen.getByTestId("post-image-carousel");
    Object.defineProperty(carousel, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(carousel, "scrollLeft", { value: 400, configurable: true });
    fireEvent.scroll(carousel);

    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("does not render a counter when the post has exactly one image", () => {
    usePostDetailQuery.mockReturnValue({
      data: { ...samplePostDetail, images: [samplePostDetail.images[0]] },
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
  });

  it("opens a full-screen lightbox when an image is clicked, and closes it via the close button", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "查看大图" })[0]);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not render a contact block when contactMethod/contactValue are null", () => {
    usePostDetailQuery.mockReturnValue({
      data: { ...samplePostDetail, contactMethod: null, contactValue: null },
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.queryByText(/联系方式/)).not.toBeInTheDocument();
  });

  it("renders without crashing and without a placeholder graphic when the post has zero images", () => {
    usePostDetailQuery.mockReturnValue({
      data: { ...samplePostDetail, images: [] },
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByTestId("post-thumbnail-placeholder")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sunny room near metro" })
    ).toBeInTheDocument();
  });

  it("still renders FavoriteButton, ContactSellerButton and the 举报 link alongside the real content", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("button", { name: "☆ 收藏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "联系发布者" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "举报" })).toHaveAttribute(
      "href",
      "/post/post-1/report"
    );
    expect(screen.getByRole("button", { name: "分享" })).toBeInTheDocument();
  });

  it("calls Share.share with the post title, formatted price, and the hardcoded production domain (not window.location.origin) when 分享 is clicked", async () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalledWith({
        title: "Sunny room near metro",
        text: "USD 1,200",
        url: "https://www.saminest.com/post/post-1",
        dialogTitle: "分享"
      });
    });
  });

  // 用户主动关掉系统分享面板也会让 Share.share() reject——这跟真的调用
  // 失败没法可靠区分，按设计应该静默吞掉，不弹任何用户可见的错误提示。
  it("does not show any error message when Share.share rejects (e.g. the user dismissed the native share sheet)", async () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });
    shareMock.mockRejectedValue(new Error("Share canceled"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("renders the comment section with the comment count from PostDetail.commentCount", () => {
    usePostDetailQuery.mockReturnValue({
      data: { ...samplePostDetail, commentCount: 12 },
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(
      screen.getByRole("heading", { name: "评论 (12)" })
    ).toBeInTheDocument();
  });

  it("shows the publish success message as its own banner above the real post content", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderAtWithState("/post/post-1", {
      publishSuccessMessage: "发布成功，等待审核"
    });

    const statuses = screen.getAllByRole("status");
    expect(statuses[0]).toHaveTextContent("发布成功，等待审核");
    expect(
      screen.getByRole("heading", { name: "Sunny room near metro" })
    ).toBeInTheDocument();
  });
});
