import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render-with-providers";
import { CommunityCard, type CommunityCardProps } from "./community-card";

function renderCard(overrides: Partial<CommunityCardProps> = {}) {
  const props: CommunityCardProps = {
    name: "DMV 华人社区",
    memberCount: 128,
    todayPostCount: 3,
    description: "DC / MD / VA 华人交流",
    to: "/community/dmv",
    joinState: "join",
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    ...overrides
  };
  return { props, ...renderWithProviders(<CommunityCard {...props} />) };
}

describe("CommunityCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders name, member count, today's post count and description — no avatar square, no 州社区 tag", () => {
    renderCard();

    expect(screen.getByRole("heading", { name: "DMV 华人社区" })).toBeInTheDocument();
    expect(screen.getByText("128 位成员 · 今日 3 个新帖子")).toBeInTheDocument();
    expect(screen.getByText("DC / MD / VA 华人交流")).toBeInTheDocument();
    expect(screen.queryByText("DMV")).not.toBeInTheDocument();
    expect(screen.queryByText("州社区")).not.toBeInTheDocument();
  });

  it("shows the verified icon by default, and hides it when isOfficial is false (non-official communities)", () => {
    const { container, unmount } = renderCard();
    expect(container.querySelector("svg.lucide-badge-check")).not.toBeNull();
    unmount();

    const second = renderCard({ isOfficial: false });
    expect(second.container.querySelector("svg.lucide-badge-check")).toBeNull();
  });

  it("omits the '今日 N 个新帖子' segment (instead of showing a jumpy 0) while the count is still loading", () => {
    renderCard({ todayPostCount: undefined });

    expect(screen.getByText("128 位成员")).toBeInTheDocument();
    expect(screen.queryByText(/今日/)).not.toBeInTheDocument();
  });

  it("shows 今日 0 个新帖子 when the count has loaded and is genuinely zero", () => {
    renderCard({ todayPostCount: 0 });

    expect(screen.getByText("128 位成员 · 今日 0 个新帖子")).toBeInTheDocument();
  });

  it("links the whole card to the given path via a stretched link named after the community", () => {
    renderCard();

    expect(screen.getByRole("link", { name: "DMV 华人社区" })).toHaveAttribute("href", "/community/dmv");
  });

  // 非法 HTML 结构回归：<a> 里不能嵌套 <button>——"加入"按钮必须是 <a>
  // 的兄弟节点而不是后代。
  it("does not nest the join button inside the link", () => {
    renderCard();

    const link = screen.getByRole("link", { name: "DMV 华人社区" });
    const button = screen.getByRole("button", { name: "加入" });
    expect(link.contains(button)).toBe(false);
  });

  it("calls onJoin (and nothing else) when the 加入 button is clicked", () => {
    const { props } = renderCard();

    fireEvent.click(screen.getByRole("button", { name: "加入" }));

    expect(props.onJoin).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows 加入中… while joining", () => {
    renderCard({ joinState: "joining" });

    expect(screen.getByRole("button", { name: "加入中…" })).toBeDisabled();
  });

  it("turns the button into 退出 once joined, calling onLeave (not onJoin) on click", () => {
    const { props } = renderCard({ joinState: "joined" });

    expect(screen.queryByRole("button", { name: "加入" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "退出" }));

    expect(props.onLeave).toHaveBeenCalledTimes(1);
    expect(props.onJoin).not.toHaveBeenCalled();
  });

  it("disables the button with 退出中… while leaving", () => {
    renderCard({ joinState: "leaving" });

    expect(screen.getByRole("button", { name: "退出中…" })).toBeDisabled();
  });
});
