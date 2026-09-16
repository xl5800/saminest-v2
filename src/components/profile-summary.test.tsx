import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn()
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { ProfileSummary } from "./profile-summary";

// 整卡可点任务卡：ProfileSummary 现在无条件调用 useNavigate()（不管
// profileHref 有没有传，这个 hook 本身都要在 Router 上下文里调用），所以
// 这个文件里所有测试都要包一层 <MemoryRouter>，不再是"只有用到 Link 的
// 测试才需要包"——跟这个文件之前的写法（只有 profileHref/avatarHref 这
// 两组测试才手动包 MemoryRouter）不一样，这是整卡可点这个新实现方式带来
// 的必然要求，不是随手加的。
function renderSummary(ui: Parameters<typeof render>[0]) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ProfileSummary", () => {
  afterEach(() => {
    cleanup();
    navigateMock.mockReset();
  });

  it("renders an <img> avatar when avatarUrl is present", () => {
    const { container } = renderSummary(
      <ProfileSummary displayName="Bob" avatarUrl="https://example.com/bob.jpg" />
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/bob.jpg"
    );
  });

  it("renders an uppercase nickname-initial placeholder (no <img>) when avatarUrl is null", () => {
    const { container } = renderSummary(<ProfileSummary displayName="bob" avatarUrl={null} />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("falls back to a '?' placeholder initial when displayName is null/blank", () => {
    renderSummary(<ProfileSummary displayName={null} avatarUrl={null} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  // 22 号卡（用户主页改版）清理掉不再有调用方的 "default" 变体之后，这个
  // 组件只剩"我的"页用的这一种横排卡片形态（24 号卡曾经去掉 bio、加回
  // 简介+年龄任务卡又加回来了，见下面 bio/age 那组测试）——那个页面的
  // <h1> 已经是 sr-only 的"我的"，这里不应该再渲染出第二个 <h1>。
  it("does not render an <h1> — the caller's page already owns the single <h1>", () => {
    renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  // 整卡可点任务卡：原来右上角的"查看个人主页"圆形图标按钮整个去掉了，
  // 改成整张卡片可点（role="link"）+ 右侧一个纯装饰的箭头。
  describe("整卡可点 (整卡可点 + 铅笔编辑角标任务卡，取代原来右上角的图标按钮)", () => {
    it("is not clickable (no role=link, no chevron) when profileHref is not provided", () => {
      const { container } = renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(screen.queryByRole("link", { name: "查看个人主页" })).not.toBeInTheDocument();
      // 没有 profileHref 时最外层容器不应该带 role="link"。
      expect(container.querySelector('[role="link"]')).not.toBeInTheDocument();
    });

    it("makes the whole card a role=link that navigates to profileHref on click", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} profileHref="/users/user-1" />);

      const card = screen.getByRole("link", { name: "查看个人主页" });
      fireEvent.click(card);

      expect(navigateMock).toHaveBeenCalledWith("/users/user-1");
    });

    it("navigates when the card is focused and Enter is pressed (keyboard access)", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} profileHref="/users/user-1" />);

      const card = screen.getByRole("link", { name: "查看个人主页" });
      fireEvent.keyDown(card, { key: "Enter" });

      expect(navigateMock).toHaveBeenCalledWith("/users/user-1");
    });

    it("navigates when clicking the nickname text (whole card is clickable, not just the avatar)", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} profileHref="/users/user-1" />);

      fireEvent.click(screen.getByText("Alice"));

      expect(navigateMock).toHaveBeenCalledWith("/users/user-1");
    });

    it("navigates when clicking the bio text too", () => {
      renderSummary(
        <ProfileSummary
          displayName="Alice"
          avatarUrl={null}
          profileHref="/users/user-1"
          bio="Hi there, I like hiking."
        />
      );

      fireEvent.click(screen.getByText("Hi there, I like hiking."));

      expect(navigateMock).toHaveBeenCalledWith("/users/user-1");
    });

    it("renders a decorative chevron on the right when profileHref is provided", () => {
      const { container } = renderSummary(
        <ProfileSummary displayName="Alice" avatarUrl={null} profileHref="/users/user-1" />
      );

      expect(container.querySelector("svg.lucide-chevron-right")).toBeInTheDocument();
    });

    it("does not render a chevron when profileHref is not provided", () => {
      const { container } = renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(container.querySelector("svg.lucide-chevron-right")).not.toBeInTheDocument();
    });
  });

  // 整卡可点 + 铅笔编辑角标任务卡：头像右下角新增的编辑角标，点击跳
  // /profile/edit，且不能同时触发整卡跳转（事件不冒泡）。
  describe("头像右下角铅笔编辑角标 (整卡可点 + 铅笔编辑角标任务卡)", () => {
    // aria-label 用"编辑资料"而不是"编辑个人信息"——调用方 profile-page.tsx
    // 下面"账号与服务"卡片里已经有一行同目标、文案是"编辑个人信息"的
    // GroupRow，两个可访问名字不能撞在一起，见 profile-summary.tsx 的
    // 注释。
    it("renders a '编辑资料' link pinned to the avatar, pointing to /profile/edit", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(screen.getByRole("link", { name: "编辑资料" })).toHaveAttribute(
        "href",
        "/profile/edit"
      );
    });

    it("renders the edit badge even when profileHref is not provided (card itself is not clickable)", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(screen.getByRole("link", { name: "编辑资料" })).toBeInTheDocument();
    });

    it("clicking the pencil badge does not also trigger the whole-card navigation (event does not bubble)", () => {
      renderSummary(
        <ProfileSummary displayName="Alice" avatarUrl={null} profileHref="/users/user-1" />
      );

      fireEvent.click(screen.getByRole("link", { name: "编辑资料" }));

      // 铅笔本身是一个真的 <Link to="/profile/edit">，浏览器/jsdom 里
      // 点击它不会真的触发 useNavigate() 的 navigate("/users/user-1")——
      // 只要 navigateMock 没有被调用过，就说明事件确实没有冒泡到外层
      // 整卡的 onClick。
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe("bio/age (加回简介+年龄任务卡)", () => {
    it("does not render a bio or age line when neither is provided", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} />);

      expect(screen.queryByText(/岁/)).not.toBeInTheDocument();
    });

    it("renders the bio text below the avatar/name row when bio is set", () => {
      renderSummary(
        <ProfileSummary displayName="Alice" avatarUrl={null} bio="Hi there, I like hiking." />
      );

      expect(screen.getByText("Hi there, I like hiking.")).toBeInTheDocument();
    });

    it("does not render a bio line when bio is null", () => {
      // 没有具体文案可断言"不存在"，改断言卡片里只有昵称这一个 <p>
      // 段落，没有多出一个 bio 段落。
      const { container } = renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} bio={null} />);
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });

    // 整卡可点任务卡：年龄从"简介下面单独一行纯文字"改成跟昵称同一行的
    // 胶囊，不再是一个 <p>，这里改用 getByText 断言文案本身，不再依赖
    // "是不是 <p> 标签"这件事。
    it("shows the age as 'N 岁' in a pill next to the nickname when age is a number", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} age={28} />);

      const pill = screen.getByText("28 岁");
      expect(pill).toBeInTheDocument();
      // 胶囊跟昵称是同一个父容器的两个直接子元素（同一行）。
      expect(pill.parentElement).toContainElement(screen.getByText("Alice"));
    });

    it("does not render an age pill when age is null", () => {
      renderSummary(<ProfileSummary displayName="Alice" avatarUrl={null} age={null} />);

      expect(screen.queryByText(/岁/)).not.toBeInTheDocument();
    });

    it("renders the bio line below the nickname/age row when both are provided", () => {
      renderSummary(
        <ProfileSummary displayName="Alice" avatarUrl={null} bio="Hi there." age={28} />
      );

      expect(screen.getByText("Hi there.")).toBeInTheDocument();
      expect(screen.getByText("28 岁")).toBeInTheDocument();
    });
  });

  describe("children (24 号卡：入口紧跟在卡片固定内容下面，不加分割线)", () => {
    it("renders children directly below the card's fixed content, with no border/divider element between them", () => {
      const { container } = renderSummary(
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
});
