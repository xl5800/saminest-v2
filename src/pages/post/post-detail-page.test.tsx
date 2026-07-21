import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Location } from "react-router-dom";

const {
  useFavoritePostIdsQuery,
  useToggleFavoriteMutation,
  usePostAuthorQuery,
  useCreateDirectConversationMutation,
  usePostDetailQuery
} = vi.hoisted(() => ({
  useFavoritePostIdsQuery: vi.fn(),
  useToggleFavoriteMutation: vi.fn(),
  usePostAuthorQuery: vi.fn(),
  useCreateDirectConversationMutation: vi.fn(),
  usePostDetailQuery: vi.fn()
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
  publishedAt: "2026-07-01T00:00:00.000Z",
  authorDisplayName: "Alice",
  contactMethod: "email",
  contactValue: "alice@example.com",
  images: [
    { id: "img-1", publicUrl: "https://img.example.com/1.jpg", sortOrder: 0 },
    { id: "img-2", publicUrl: "https://img.example.com/2.jpg", sortOrder: 1 }
  ]
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
    useFavoritePostIdsQuery.mockReturnValue({ data: [] });
    useToggleFavoriteMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    // 默认查询已解析完成、且作者不是当前登录用户，让 ContactSellerButton
    // 正常渲染，避免每个测试都要各自重复这段 mock。
    usePostAuthorQuery.mockReturnValue({ data: "some-other-author", isSuccess: true });
    useCreateDirectConversationMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false
    });
  });

  it("shows a loading message while the post detail query is pending", () => {
    usePostDetailQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
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
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "https://img.example.com/1.jpg");
    expect(images[1]).toHaveAttribute("src", "https://img.example.com/2.jpg");
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
