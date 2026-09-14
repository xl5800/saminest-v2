import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useFavoritePostIdsQuery, useToggleFavoriteMutation, navigateMock, mutateMock } =
  vi.hoisted(() => ({
    useFavoritePostIdsQuery: vi.fn(),
    useToggleFavoriteMutation: vi.fn(),
    navigateMock: vi.fn(),
    mutateMock: vi.fn()
  }));

vi.mock("../features/favorites/use-favorite-post-ids-query", () => ({
  useFavoritePostIdsQuery
}));
vi.mock("../features/favorites/use-toggle-favorite-mutation", () => ({
  useToggleFavoriteMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { AppError } from "../utils/app-error";
import { FavoriteButton } from "./favorite-button";

const initialAuthState = useAuthStore.getState();

describe("FavoriteButton", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    navigateMock.mockReset();
    mutateMock.mockReset();
    useFavoritePostIdsQuery.mockReset();
    useToggleFavoriteMutation.mockReset();

    useFavoritePostIdsQuery.mockReturnValue({ data: [] });
    useToggleFavoriteMutation.mockReturnValue({ mutate: mutateMock, isPending: false });
  });

  it("navigates to /login and does not call the mutation when logged out", () => {
    renderWithProviders(<FavoriteButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button"));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(mutateMock).not.toHaveBeenCalled();
  });

  // UI 审计 P0 #2：default variant 之前是裸文字"★ 已收藏"/"☆ 收藏"，没有
  // 任何样式；这次补成跟 icon variant 同一套 Star 图标+aria-label 的圆形
  // 图标按钮（DESIGN.md 的 icon-button token，36×36），不再有这两个字符
  // 本身可断言，改成断言可访问性属性和图标的 fill/颜色 class。
  describe("default variant styling (UI 审计 P0 #2)", () => {
    it("renders a circular Star icon button (not bare '☆ 收藏' text) with a '收藏' aria-label when not yet favorited", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useFavoritePostIdsQuery.mockReturnValue({ data: [] });

      const { container } = renderWithProviders(<FavoriteButton postId="post-1" />);

      const button = screen.getByRole("button", { name: "收藏" });
      expect(button).not.toHaveTextContent("☆ 收藏");
      expect(button).toHaveClass("h-9", "w-9", "rounded-full");

      const star = container.querySelector("svg.lucide-star");
      expect(star).toBeInTheDocument();
      expect(star).toHaveAttribute("fill", "none");
      expect(star).not.toHaveClass("text-primary");
    });

    it("renders a '取消收藏' aria-label with a filled, primary-colored Star icon when already favorited", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useFavoritePostIdsQuery.mockReturnValue({ data: ["post-1"] });

      const { container } = renderWithProviders(<FavoriteButton postId="post-1" />);

      const button = screen.getByRole("button", { name: "取消收藏" });
      expect(button).not.toHaveTextContent("★ 已收藏");

      const star = container.querySelector("svg.lucide-star");
      expect(star).toHaveAttribute("fill", "currentColor");
      expect(star).toHaveClass("text-primary");
    });

    // 点击后（未收藏 → 已收藏）视觉状态切换：aria-pressed/aria-label/图标
    // fill 三者一起随 isFavorited 变化——FavoriteButton 本身不维护乐观
    // 更新的本地 state，展示状态完全来自 useFavoritePostIdsQuery 的返回值，
    // 这里用两次独立渲染模拟"收藏前"/"收藏成功后返回的收藏列表已经包含
    // 这个帖子"这两个真实状态（不用 rerender——renderWithProviders 包了
    // 一层 QueryClientProvider/MemoryRouter，rerender 会把整棵树换成裸的
    // <FavoriteButton />，丢掉这些 Provider）。
    it("shows the unfilled/muted Star before favoriting, and the filled/primary Star once the post is already favorited", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useFavoritePostIdsQuery.mockReturnValue({ data: [] });

      const before = renderWithProviders(<FavoriteButton postId="post-1" />);
      expect(screen.getByRole("button", { name: "收藏" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
      expect(before.container.querySelector("svg.lucide-star")).toHaveAttribute("fill", "none");
      cleanup();

      useFavoritePostIdsQuery.mockReturnValue({ data: ["post-1"] });
      const after = renderWithProviders(<FavoriteButton postId="post-1" />);
      const button = screen.getByRole("button", { name: "取消收藏" });
      expect(button).toHaveAttribute("aria-pressed", "true");
      const star = after.container.querySelector("svg.lucide-star");
      expect(star).toHaveAttribute("fill", "currentColor");
      expect(star).toHaveClass("text-primary");
    });
  });

  it("calls the mutation to add a favorite when logged in and the post is not yet favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        userId: "user-1",
        postId: "post-1",
        isCurrentlyFavorited: false
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("calls the mutation to remove a favorite when logged in and the post is already favorited", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: ["post-1"] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(button);

    expect(mutateMock).toHaveBeenCalledWith(
      {
        userId: "user-1",
        postId: "post-1",
        isCurrentlyFavorited: true
      },
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it("shows the account-restricted message when the mutation's onError reports ACCOUNT_RESTRICTED", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button"));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(
        new AppError(
          "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
          "ACCOUNT_RESTRICTED"
        )
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
  });

  it("does not show any alert when the mutation's onError reports a generic (non-restricted) failure", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    fireEvent.click(screen.getByRole("button"));

    const { onError } = mutateMock.mock.calls[0][1];
    act(() => {
      onError(new Error("network down"));
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // 23 号卡：帖子详情页的分享/收藏/举报图标行用这个新变体。
  describe("variant='icon'", () => {
    it("renders a '收藏'/'取消收藏' aria-label reflecting favorited state, with a visible '收藏' text label either way", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useFavoritePostIdsQuery.mockReturnValue({ data: ["post-1"] });

      renderWithProviders(<FavoriteButton postId="post-1" variant="icon" />);

      const button = screen.getByRole("button", { name: "取消收藏" });
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(button).toHaveTextContent("收藏");
    });

    it("shares the exact same toggle-favorite logic as the default variant", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useFavoritePostIdsQuery.mockReturnValue({ data: [] });

      renderWithProviders(<FavoriteButton postId="post-1" variant="icon" />);

      fireEvent.click(screen.getByRole("button", { name: "收藏" }));

      expect(mutateMock).toHaveBeenCalledWith(
        { userId: "user-1", postId: "post-1", isCurrentlyFavorited: false },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });
  });

  it("disables the button while the mutation is pending, preventing a double submit", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });
    useToggleFavoriteMutation.mockReturnValue({ mutate: mutateMock, isPending: true });

    renderWithProviders(<FavoriteButton postId="post-1" />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    fireEvent.click(button);

    expect(mutateMock).not.toHaveBeenCalled();
  });
});
