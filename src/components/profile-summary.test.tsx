import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProfileSummary } from "./profile-summary";

describe("ProfileSummary", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an <img> avatar when avatarUrl is present", () => {
    const { container } = render(
      <ProfileSummary displayName="Bob" avatarUrl="https://example.com/bob.jpg" />
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/bob.jpg"
    );
  });

  it("renders an uppercase nickname-initial placeholder (no <img>) when avatarUrl is null", () => {
    const { container } = render(<ProfileSummary displayName="bob" avatarUrl={null} />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("falls back to a '?' placeholder initial when displayName is null/blank", () => {
    render(<ProfileSummary displayName={null} avatarUrl={null} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  // 22 号卡（用户主页改版）清理掉不再有调用方的 "default" 变体、24 号卡
  // 又去掉了 bio/tertiaryText 之后，这个组件只剩"我的"页用的这一种横排
  // 卡片形态——那个页面的 <h1> 已经是 sr-only 的"我的"，这里不应该再渲染
  // 出第二个 <h1>。
  it("does not render an <h1> — the caller's page already owns the single <h1>", () => {
    render(<ProfileSummary displayName="Alice" avatarUrl={null} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  describe("editHref (24 号卡：右上角编辑资料铅笔图标)", () => {
    it("does not render an edit icon-button when editHref is not provided", () => {
      render(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(screen.queryByRole("link", { name: "编辑资料" })).not.toBeInTheDocument();
    });

    it("renders a small circular '编辑资料' icon-button link when editHref is provided", () => {
      render(
        <MemoryRouter>
          <ProfileSummary displayName="Alice" avatarUrl={null} editHref="/profile/edit" />
        </MemoryRouter>
      );

      expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute(
        "href",
        "/profile/edit"
      );
    });
  });

  describe("children (24 号卡：入口紧跟在头像/昵称行下面，不加分割线)", () => {
    it("renders children directly below the avatar/name/edit-icon row, with no border/divider element between them", () => {
      const { container } = render(
        <ProfileSummary displayName="Alice" avatarUrl={null}>
          <div data-testid="stats-row">我的发布 我的收藏</div>
        </ProfileSummary>
      );

      const statsRow = screen.getByTestId("stats-row");
      expect(statsRow).toBeInTheDocument();
      // 卡片最外层容器（statsRow 的爷爷节点）不应该带任何 border-*/
      // divide-* 类名——24.2.2 明确要求"头像和下面的入口之间不要加分割线"。
      const card = container.firstElementChild;
      expect(card?.className).not.toMatch(/\bborder\b/);
      expect(card?.className).not.toMatch(/\bdivide-/);
    });
  });

  describe("avatarHref (11 号卡：头像跳转到自己的公开主页预览)", () => {
    it("does not wrap the avatar in a link when avatarHref is not provided", () => {
      const { container } = render(<ProfileSummary displayName="Bob" avatarUrl={null} />);

      expect(container.querySelector("a")).not.toBeInTheDocument();
    });

    it("wraps the avatar (only) in a link to avatarHref when provided", () => {
      render(
        <MemoryRouter>
          <ProfileSummary displayName="Bob" avatarUrl={null} avatarHref="/users/user-1" />
        </MemoryRouter>
      );

      const link = screen.getByRole("link", { name: "预览我的主页" });
      expect(link).toHaveAttribute("href", "/users/user-1");
      // 昵称本身不应该也被包进这个链接——只有头像可点击，卡片其余部分
      // 视觉/结构不变。
      expect(screen.getByText("Bob").closest("a")).toBeNull();
    });
  });
});
