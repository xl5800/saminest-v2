import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  shareMock,
  navigateMock
} = vi.hoisted(() => ({
  useFavoritePostIdsQuery: vi.fn(),
  useToggleFavoriteMutation: vi.fn(),
  usePostAuthorQuery: vi.fn(),
  useCreateDirectConversationMutation: vi.fn(),
  usePostDetailQuery: vi.fn(),
  usePostCommentsQuery: vi.fn(),
  useCreateCommentMutation: vi.fn(),
  useDeleteCommentMutation: vi.fn(),
  shareMock: vi.fn(),
  navigateMock: vi.fn()
}));

// 23 号卡：悬浮"关闭"按钮点击后调用 navigate(-1)——跟其它页面（比如
// profile-page.test.tsx）验证 useNavigate 调用参数是同一个 mock 模式，
// 用 importOriginal 保留 MemoryRouter/Routes/Route/Link 等真实实现，只替换
// useNavigate。
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

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

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { PostDetailPage } from "./post-detail-page";

const initialAuthState = useAuthStore.getState();

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
  authorId: "user-2",
  authorAvatarUrl: "https://img.example.com/alice-avatar.jpg",
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
    useAuthStore.setState(initialAuthState, true);
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
    navigateMock.mockReset();
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

  // 23 号卡：顶部栏整个换掉了——21 号卡的 TopBar nav-only（一条常规返回
  // 箭头顶栏）不再使用，改成页面自己渲染的悬浮"关闭"圆形按钮，不再有
  // TopBar 组件、不再有"返回"这个可访问名称的按钮。
  it("renders a floating 关闭 button (no TopBar, no brand/publish text), even while the post detail query is pending", () => {
    usePostDetailQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "返回" })).not.toBeInTheDocument();
    expect(screen.queryByText("Saminest")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
  });

  it("navigates back (navigate(-1)) when the floating 关闭 button is clicked", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(navigateMock).toHaveBeenCalledWith(-1);
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

  it("renders the full post content — title, description, price, location, author, contact info and all images", () => {
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
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "https://img.example.com/1.jpg");
    expect(images[1]).toHaveAttribute("src", "https://img.example.com/2.jpg");
  });

  // 23 号卡：分类标签 pill 和发布时间这两项，新的信息顺序里没有列出来，
  // 这次一并从详情页拿掉了（见完工报告里对这条决定的说明）。
  it("does not render the category tag pill or the listing date — dropped in the 23 号卡 layout, unlike location/author which are kept", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.queryByText("租房")).not.toBeInTheDocument();
    expect(screen.queryByText("2000-07-01")).not.toBeInTheDocument();
  });

  // 23 号卡：顺序从"价格在标题上方（放大突出）"改成"标题在价格上方"——用
  // compareDocumentPosition 断言标题文本节点在价格之前，而不是只断言两者
  // 都存在（存在性已经被上面那条测试覆盖了）。
  it("renders the title above the price (23 号卡 layout reorder: image → title → price → location → icons → ...)", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    const title = screen.getByRole("heading", { name: "Sunny room near metro" });
    const price = screen.getByText("USD 1,200");

    // Node.DOCUMENT_POSITION_FOLLOWING (4): price 在 title 之后。
    expect(title.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // 23 号卡：价格为空时那一整行完全不渲染——不是留空、不是显示"价格未
  // 填写"，跟 19 号卡帖子卡片的规则一致。
  it("renders no price line at all (not a '价格未填写' placeholder) when the post has no price", () => {
    usePostDetailQuery.mockReturnValue({
      data: { ...samplePostDetail, priceAmount: null, priceLabel: null },
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
    expect(screen.queryByText("价格未填写")).not.toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
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

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // 页面自己现在也有一个"关闭"按钮（23 号卡的悬浮返回按钮），跟
    // ImageLightbox 自己的"关闭"按钮重名——限定在 dialog 范围内查找，
    // 确保点的是查看器自己的关闭按钮，不是页面级的那个。
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));

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

  // 23 号卡：分享/收藏/举报三个图标一行，收藏用 FavoriteButton 新增的
  // icon 变体（可访问名从"☆ 收藏"变成"收藏"，见 favorite-button.tsx）；
  // 底部常驻"咨询"大按钮复用 ContactSellerButton（文案从"联系发布者"
  // 换成"咨询"，背后逻辑没变）。
  it("still renders FavoriteButton (icon variant), the 咨询 button (ContactSellerButton relabeled) and the 举报 link alongside the real content", () => {
    usePostDetailQuery.mockReturnValue({
      data: samplePostDetail,
      isPending: false,
      isError: false
    });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("button", { name: "收藏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "咨询" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "举报" })).toHaveAttribute(
      "href",
      "/post/post-1/report"
    );
    expect(screen.getByRole("button", { name: "分享" })).toBeInTheDocument();
  });

  // 任务卡2：底部"咨询"按钮从撑满宽度的大色块横条改成白底容器（左右各
  // 16px 留白）里的一个 48px 高、12px 圆角、15px 字号的按钮，跟对方消息
  // 气泡那类"纯 className/布局调整"任务一样，只断言外层容器和按钮自己的
  // 关键样式类，不重新验证 ContactSellerButton 内部的点击/建会话逻辑
  // （那部分有它自己的 contact-seller-button.test.tsx）。
  describe("底部'咨询'按钮容器（任务卡2：改小、改克制）", () => {
    it("wraps the button in a white, bottom-padded, 16px-inset container with a top border, and keeps the safe-area padding on the container", () => {
      usePostDetailQuery.mockReturnValue({
        data: samplePostDetail,
        isPending: false,
        isError: false
      });

      renderWithProviders(<PostDetailPage />, {
        initialEntries: ["/post/post-1"],
        route: "/post/:id"
      });

      const bar = screen.getByTestId("post-detail-contact-bar");
      expect(bar).toHaveClass("bg-white", "border-t", "border-border", "px-4", "fixed", "inset-x-0", "bottom-0");
      expect(bar.style.paddingBottom).toBe("calc(0.75rem + env(safe-area-inset-bottom))");
    });

    it("renders the 咨询 button itself at 48px tall, 12px rounded corners, and the smaller 15px font size — not the old full-width 16px-text color bar", () => {
      usePostDetailQuery.mockReturnValue({
        data: samplePostDetail,
        isPending: false,
        isError: false
      });

      renderWithProviders(<PostDetailPage />, {
        initialEntries: ["/post/post-1"],
        route: "/post/:id"
      });

      const button = screen.getByRole("button", { name: "咨询" });
      expect(button).toHaveClass("h-12", "rounded-xl", "text-[15px]", "w-full", "bg-primary", "text-white");
      expect(button.className).not.toContain("text-base");
      expect(button.className).not.toContain("shadow-fab");
    });

    // 任务卡2 保留的原有行为：作者查看自己发布的帖子时 ContactSellerButton
    // 内部直接 return null（这条判断在组件内部，任务卡明确不让动）。改版前
    // 这个按钮自己就是唯一的 fixed 元素，不渲染就是真的什么都没有；这次
    // 新包了一层容器之后，如果容器不管里面渲不渲染都无条件显示，会在这个
    // 场景下多出一条空的白色横条——这是这次任务卡范围内需要连带避免的
    // 视觉回归，容器加了 empty:hidden（Tailwind 内置 :empty 伪类变体）。
    // jsdom 不会真的执行 CSS（没有加载/应用生成的样式表），没法在这里断言
    // "肉眼看不见"，但可以断言 DOM 结构层面的前提成立——容器确实渲染成了
    // 一个没有任何子节点的空元素，:empty 选择器要匹配的正是这个状态；
    // 真正"肉眼确认不可见"是在真实浏览器里做的，见完工报告。
    it("renders the contact bar container as a truly empty DOM node (no children) when the current user is viewing their own post, matching the :empty CSS precondition on the empty:hidden class", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);
      // samplePostDetail.authorId 是 "user-2"——跟上面登录的用户同一个 id，
      // 触发 ContactSellerButton 内部"作者不能联系自己"的隐藏判断。
      usePostAuthorQuery.mockReturnValue({ data: "user-2", isSuccess: true });
      usePostDetailQuery.mockReturnValue({
        data: samplePostDetail,
        isPending: false,
        isError: false
      });

      renderWithProviders(<PostDetailPage />, {
        initialEntries: ["/post/post-1"],
        route: "/post/:id"
      });

      expect(screen.queryByRole("button", { name: "咨询" })).not.toBeInTheDocument();
      const bar = screen.getByTestId("post-detail-contact-bar");
      expect(bar).toHaveClass("empty:hidden");
      expect(bar.children).toHaveLength(0);
      expect(bar.textContent).toBe("");
    });
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

  // 23 号卡补完：发帖者从纯文字换成 PersonCard（头像+昵称+副标题+chevron，
  // 整行可点，见 person-card.tsx）——跟活动详情页的"发起人卡片"复用同一个
  // 组件，这里只验证 PostDetailPage 把正确的 props 传给了它，PersonCard
  // 自己的渲染细节由 person-card.test.tsx 覆盖，不在这里重复断言。
  describe("author card (PersonCard, 23 号卡补完)", () => {
    it("links to /users/:authorId and shows the author's avatar", () => {
      usePostDetailQuery.mockReturnValue({
        data: samplePostDetail,
        isPending: false,
        isError: false
      });

      const { container } = renderWithProviders(<PostDetailPage />, {
        initialEntries: ["/post/post-1"],
        route: "/post/:id"
      });

      const authorLink = screen.getByRole("link", { name: /Alice/ });
      expect(authorLink).toHaveAttribute("href", "/users/user-2");

      // PersonCard 的头像 <img alt=""> 是装饰性图片，不带 role="img"（跟
      // 帖子封面图那两张不同，那两张有真实 alt 文字），用 querySelectorAll
      // 按 src 精确匹配，不用 getAllByRole。
      const avatarImages = Array.from(container.querySelectorAll("img")).filter(
        (img) => img.getAttribute("src") === "https://img.example.com/alice-avatar.jpg"
      );
      expect(avatarImages).toHaveLength(1);
    });

    // 调查结论：profiles.last_active_at 这一列虽然存在，但仓库里没有任何
    // 代码会写入它，等同于没有这个数据——退回展示帖子自己的发布时间。
    it("shows '发布于 <相对时间>' as the subtitle (not '活跃于 X 前' — profiles.last_active_at is never populated by any code path)", () => {
      usePostDetailQuery.mockReturnValue({
        data: samplePostDetail,
        isPending: false,
        isError: false
      });

      renderWithProviders(<PostDetailPage />, {
        initialEntries: ["/post/post-1"],
        route: "/post/:id"
      });

      // samplePostDetail.createdAt 是 2000 年，早就超过相对时间的 30 天
      // 上限，会退化成 formatListingDate 的绝对日期格式，断言结果是
      // 确定性的，不用 mock Date.now()。
      expect(screen.getByText("发布于 2000-07-01")).toBeInTheDocument();
      expect(screen.queryByText(/活跃于/)).not.toBeInTheDocument();
    });
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

    // 23 号卡：留言区标题从"评论"改成"留言"。
    expect(
      screen.getByRole("heading", { name: "留言 (12)" })
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
