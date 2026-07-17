import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Location } from "react-router-dom";

const {
  useFavoritePostIdsQuery,
  useToggleFavoriteMutation,
  usePostAuthorQuery,
  useCreateDirectConversationMutation
} = vi.hoisted(() => ({
  useFavoritePostIdsQuery: vi.fn(),
  useToggleFavoriteMutation: vi.fn(),
  usePostAuthorQuery: vi.fn(),
  useCreateDirectConversationMutation: vi.fn()
}));

// PostDetailPage renders FavoriteButton and ContactSellerButton, which pull in
// useQuery/useMutation hooks of their own — mock those the same way
// favorite-button.test.tsx / contact-seller-button.test.tsx do so this file
// stays focused on the placeholder page's own behavior.
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

describe("PostDetailPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useFavoritePostIdsQuery.mockReset();
    useToggleFavoriteMutation.mockReset();
    usePostAuthorQuery.mockReset();
    useCreateDirectConversationMutation.mockReset();
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

  it("renders the post id from the route and a placeholder status", () => {
    renderWithProviders(<PostDetailPage />, {
      initialEntries: ["/post/post-1"],
      route: "/post/:id"
    });

    expect(screen.getByRole("heading", { name: "帖子详情" })).toBeInTheDocument();
    expect(screen.getByText("帖子 ID：post-1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "详情页正在建设中，敬请期待。"
    );
    expect(screen.getByRole("link", { name: "举报" })).toHaveAttribute(
      "href",
      "/post/post-1/report"
    );
    expect(
      screen.getByRole("button", { name: "联系发布者" })
    ).toBeInTheDocument();
  });

  it("shows the publish success message from navigation state instead of the placeholder", () => {
    renderAtWithState("/post/post-999", {
      publishSuccessMessage: "发布成功，等待审核"
    });

    expect(screen.getByText("帖子 ID：post-999")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("发布成功，等待审核");
  });
});
