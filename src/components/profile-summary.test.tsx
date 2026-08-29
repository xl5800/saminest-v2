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

  it("renders the display name as the page heading", () => {
    render(<ProfileSummary displayName="Bob" avatarUrl={null} />);

    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
  });

  it("shows the location only when locationName is non-empty", () => {
    const { rerender } = render(
      <ProfileSummary displayName="Bob" avatarUrl={null} locationName="Rockville" />
    );
    expect(screen.getByText("Rockville")).toBeInTheDocument();

    rerender(<ProfileSummary displayName="Bob" avatarUrl={null} locationName={null} />);
    expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
  });

  it("shows the bio only when it is non-empty, without a '暂无简介' placeholder", () => {
    const { rerender } = render(
      <ProfileSummary displayName="Bob" avatarUrl={null} bio="Hi there, I like hiking." />
    );
    expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();

    rerender(<ProfileSummary displayName="Bob" avatarUrl={null} bio={null} />);
    expect(screen.queryByText("Hi there, I like hiking.")).not.toBeInTheDocument();
    expect(screen.queryByText(/暂无简介/)).not.toBeInTheDocument();
  });

  it("renders children below the avatar/name/location/bio block, regardless of what the caller passes", () => {
    render(
      <ProfileSummary displayName="Bob" avatarUrl={null}>
        <button type="button">发消息</button>
      </ProfileSummary>
    );

    expect(screen.getByRole("button", { name: "发消息" })).toBeInTheDocument();
  });

  describe("size='compact' (56px 头像卡片，'我的'页用)", () => {
    it("does not render an <h1> — the caller's TopBar already owns the page's single <h1>", () => {
      render(<ProfileSummary size="compact" displayName="Alice" avatarUrl={null} />);

      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("still falls back to an uppercase initial placeholder when avatarUrl is null", () => {
      render(<ProfileSummary size="compact" displayName="bob" avatarUrl={null} />);

      expect(screen.getByText("B")).toBeInTheDocument();
    });

    // 24 号卡（"我的"页面改版）：compact 卡片不再展示简介/邮箱这两行文字
    // （codex_task_profile_redesign.md 那版"昵称/简介/邮箱三行"的验收标准
    // 已经被 24 号卡取代，见 profile-summary.tsx 顶部 size 的注释），也不
    // 展示 locationName（这条本来就没变过）。
    it("no longer shows bio or locationName in the compact card", () => {
      render(
        <ProfileSummary
          size="compact"
          displayName="Alice"
          avatarUrl={null}
          bio="喜欢 hiking"
          locationName="Rockville"
        />
      );

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.queryByText("喜欢 hiking")).not.toBeInTheDocument();
      expect(screen.queryByText("Rockville")).not.toBeInTheDocument();
    });

    describe("editHref (24 号卡：右上角编辑资料铅笔图标)", () => {
      it("does not render an edit icon-button when editHref is not provided", () => {
        render(<ProfileSummary size="compact" displayName="Alice" avatarUrl={null} />);

        expect(screen.queryByRole("link", { name: "编辑资料" })).not.toBeInTheDocument();
      });

      it("renders a small circular '编辑资料' icon-button link when editHref is provided, in the compact variant", () => {
        render(
          <MemoryRouter>
            <ProfileSummary size="compact" displayName="Alice" avatarUrl={null} editHref="/profile/edit" />
          </MemoryRouter>
        );

        expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute(
          "href",
          "/profile/edit"
        );
      });
    });

    describe("children (24 号卡：数据条紧跟在头像/昵称行下面，不加分割线)", () => {
      it("renders children directly below the avatar/name/edit-icon row, with no border/divider element between them", () => {
        const { container } = render(
          <ProfileSummary size="compact" displayName="Alice" avatarUrl={null}>
            <div data-testid="stats-row">我的发布 我的收藏</div>
          </ProfileSummary>
        );

        const statsRow = screen.getByTestId("stats-row");
        expect(statsRow).toBeInTheDocument();
        // 卡片最外层容器（statsRow 的爷爷节点）不应该带任何 border-*/
        // divide-* 类名——24.2.2 明确要求"头像和数据条之间不要加分割线"。
        const card = container.firstElementChild;
        expect(card?.className).not.toMatch(/\bborder\b/);
        expect(card?.className).not.toMatch(/\bdivide-/);
      });
    });
  });

  it("size='default' (the implicit default) still renders the display name as the page's <h1>, unaffected by the compact variant", () => {
    render(<ProfileSummary displayName="Bob" avatarUrl={null} />);

    expect(screen.getByRole("heading", { name: "Bob" })).toBeInTheDocument();
  });

  describe("avatarHref (11 号卡：头像跳转到自己的公开主页预览)", () => {
    it("does not wrap the avatar in a link when avatarHref is not provided", () => {
      const { container } = render(<ProfileSummary size="compact" displayName="Bob" avatarUrl={null} />);

      expect(container.querySelector("a")).not.toBeInTheDocument();
    });

    it("wraps the avatar (only) in a link to avatarHref when provided, in the compact variant", () => {
      render(
        <MemoryRouter>
          <ProfileSummary
            size="compact"
            displayName="Bob"
            avatarUrl={null}
            avatarHref="/users/user-1"
          />
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
