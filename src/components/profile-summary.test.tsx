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

  // 22 号卡（用户主页改版）清理掉不再有调用方的 "default" 变体之后，这个
  // 组件只剩"我的"页用的这一种横排卡片形态（24 号卡曾经去掉 bio、加回
  // 简介+年龄任务卡又加回来了，见下面 bio/age 那组测试，这条断言跟
  // 有没有 bio/age 无关）——那个页面的 <h1> 已经是 sr-only 的"我的"，这里
  // 不应该再渲染出第二个 <h1>。
  it("does not render an <h1> — the caller's page already owns the single <h1>", () => {
    render(<ProfileSummary displayName="Alice" avatarUrl={null} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  describe("profileHref (公开主页 Facebook 风格头图改版：右上角'查看个人主页'图标，取代原来的 editHref)", () => {
    it("does not render a profile icon-button when profileHref is not provided", () => {
      render(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(screen.queryByRole("link", { name: "查看个人主页" })).not.toBeInTheDocument();
    });

    it("renders a small circular '查看个人主页' icon-button link when profileHref is provided", () => {
      render(
        <MemoryRouter>
          <ProfileSummary displayName="Alice" avatarUrl={null} profileHref="/users/user-1" />
        </MemoryRouter>
      );

      expect(screen.getByRole("link", { name: "查看个人主页" })).toHaveAttribute(
        "href",
        "/users/user-1"
      );
    });
  });

  describe("bio/age (加回简介+年龄任务卡)", () => {
    it("does not render a bio or age line when neither is provided", () => {
      render(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(screen.queryByText(/岁/)).not.toBeInTheDocument();
    });

    it("renders the bio text below the avatar/name row when bio is set", () => {
      render(
        <ProfileSummary displayName="Alice" avatarUrl={null} bio="Hi there, I like hiking." />
      );

      expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();
    });

    it("does not render a bio line when bio is null", () => {
      // 没有具体文案可断言"不存在"，改断言卡片里只有昵称这一个 <p>
      // 段落，没有多出一个 bio 段落。
      const { container } = render(<ProfileSummary displayName="Alice" avatarUrl={null} bio={null} />);
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });

    it("shows the age as 'N 岁' when age is a number", () => {
      render(<ProfileSummary displayName="Alice" avatarUrl={null} age={28} />);

      expect(screen.getByText("28 岁")).toBeInTheDocument();
    });

    it("does not render an age line when age is null", () => {
      render(<ProfileSummary displayName="Alice" avatarUrl={null} age={null} />);

      expect(screen.queryByText(/岁/)).not.toBeInTheDocument();
    });

    it("renders bio above age when both are provided", () => {
      const { container } = render(
        <ProfileSummary displayName="Alice" avatarUrl={null} bio="Hi there." age={28} />
      );

      const paragraphs = Array.from(container.querySelectorAll("p")).map((p) => p.textContent);
      const bioIndex = paragraphs.indexOf("Hi there.");
      const ageIndex = paragraphs.indexOf("28 岁");
      expect(bioIndex).toBeGreaterThanOrEqual(0);
      expect(ageIndex).toBeGreaterThan(bioIndex);
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
