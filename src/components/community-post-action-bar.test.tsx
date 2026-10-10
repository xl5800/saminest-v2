import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clipboardWrite } = vi.hoisted(() => ({ clipboardWrite: vi.fn() }));

vi.mock("@capacitor/clipboard", () => ({ Clipboard: { write: clipboardWrite } }));
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
  beforeEach(() => clipboardWrite.mockReset());

  function renderBar() {
    return renderWithProviders(
      <CommunityPostActionBar communityPostId="cp-1" commentCount={3} favoriteCount={5} />
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

  it("copies the post link on share and briefly confirms", async () => {
    clipboardWrite.mockResolvedValue(undefined);
    renderBar();

    fireEvent.click(screen.getByRole("button", { name: "分享帖子" }));

    expect(await screen.findByText("链接已复制")).toBeInTheDocument();
    expect(clipboardWrite).toHaveBeenCalledWith({
      string: "https://www.saminest.com/community/post/cp-1"
    });
  });
});
