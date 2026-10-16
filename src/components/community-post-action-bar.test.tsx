import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { shareMock } = vi.hoisted(() => ({ shareMock: vi.fn() }));

// 社区分享卡片任务卡：分享按钮改走 useShareLink() → shareLink()，这里直接
// mock shareLink（跟 activity-detail-page.test.tsx 同一个做法）。
vi.mock("../features/share/share-link", () => ({
  shareLink: shareMock,
  isWechatBrowser: () => false
}));
vi.mock("./community-post-favorite-button", () => ({
  CommunityPostFavoriteButton: ({
    communityPostId,
    variant,
    favoriteCount
  }: {
    communityPostId: string;
    variant?: string;
    favoriteCount?: number;
  }) => (
    <button type="button" aria-label="收藏" data-post-id={communityPostId} data-variant={variant}>
      {favoriteCount}
    </button>
  )
}));

import { renderWithProviders } from "../test/render-with-providers";
import { CommunityPostActionBar } from "./community-post-action-bar";

describe("CommunityPostActionBar", () => {
  afterEach(() => cleanup());
  beforeEach(() => shareMock.mockReset());

  function renderBar() {
    return renderWithProviders(
      <CommunityPostActionBar
        communityPostId="cp-1"
        commentCount={3}
        favoriteCount={5}
        likeCount={2}
        title={null}
        body="周末有人一起去 Costco 吗"
        communityName="DMV 社区"
      />
    );
  }

  it("shows icons with numbers only (no 收藏/分享 text labels), using the inline favorite variant", () => {
    const { container } = renderBar();

    expect(screen.getByLabelText("3 条评论")).toHaveTextContent("3");
    const favorite = screen.getByRole("button", { name: "收藏" });
    expect(favorite).toHaveAttribute("data-variant", "inline");
    expect(favorite).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: "分享帖子" })).toHaveTextContent("");
    expect(container).not.toHaveTextContent("分享");
    expect(container.querySelector(".rounded-full.border")).toBeNull();
  });

  it("shares the post link (with a ?s= timestamp) and confirms when it fell back to copying", async () => {
    shareMock.mockResolvedValue("copied");
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "分享帖子" }));

    expect(await screen.findByText("链接已复制")).toBeInTheDocument();
    const input = shareMock.mock.calls[0][0];
    expect(input.title).toBe("周末有人一起去 Costco 吗");
    expect(input.text).toBe("DMV 社区 · 华邻");
    expect(input.url).toMatch(/^https:\/\/www\.saminest\.com\/community\/post\/cp-1\?s=\d+$/);
  });

  it("shows the WeChat forward guide inside WeChat", async () => {
    shareMock.mockResolvedValue("wechat-guide");
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "分享帖子" }));

    expect(await screen.findByRole("dialog", { name: "分享引导" })).toBeInTheDocument();
  });
});
