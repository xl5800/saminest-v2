import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./community-post-action-bar", () => ({
  CommunityPostActionBar: ({ communityPostId }: { communityPostId: string }) => (
    <div data-testid="action-bar" data-post-id={communityPostId} />
  )
}));

import type { CommunityPostListItem } from "../repositories/community-repository";
import { renderWithProviders } from "../test/render-with-providers";
import { CommunityPostCard } from "./community-post-card";

const post: CommunityPostListItem = {
  id: "cp-1",
  postType: "discussion",
  title: "dc有人一起打麻将吗",
  body: "求打麻将搭子",
  pinned: true,
  commentCount: 0,
  favoriteCount: 0,
  createdAt: "2026-10-09T00:00:00.000Z",
  authorId: "u-1",
  authorDisplayName: "一棵树",
  authorAvatarUrl: null,
  coverImageUrl: null,
  images: [],
  communityName: "DMV 华人社区",
  communitySlug: "dmv"
};

describe("CommunityPostCard", () => {
  afterEach(() => cleanup());

  it("home (showCommunityTag): author row on top with a clickable community tag", () => {
    renderWithProviders(<CommunityPostCard post={post} showCommunityTag />);

    const article = screen.getByRole("article");
    expect(article.firstElementChild).toHaveTextContent("一棵树");
    expect(screen.getByRole("link", { name: "DMV 华人社区" })).toHaveAttribute(
      "href",
      "/community/dmv"
    );
    expect(screen.queryByText("置顶")).not.toBeInTheDocument();
    expect(screen.getByTestId("action-bar")).toHaveAttribute("data-post-id", "cp-1");
  });

  it("community page (no tag): no community name, shows 置顶 for pinned posts instead", () => {
    renderWithProviders(<CommunityPostCard post={post} showCommunityTag={false} />);

    expect(screen.queryByRole("link", { name: "DMV 华人社区" })).not.toBeInTheDocument();
    expect(screen.getByText("置顶")).toBeInTheDocument();
  });

  it("title uses the same regular weight as the body (size alone sets it apart)", () => {
    renderWithProviders(<CommunityPostCard post={post} showCommunityTag />);

    const title = screen.getByText("dc有人一起打麻将吗");
    expect(title).toHaveClass("text-lg", "font-normal");
    expect(title).not.toHaveClass("font-bold");
    expect(screen.getByText("求打麻将搭子")).toHaveClass("text-text-body");
  });

  it("keeps the action bar outside the detail links", () => {
    renderWithProviders(<CommunityPostCard post={post} showCommunityTag />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toContainElement(screen.getByTestId("action-bar"));
    }
  });
});
