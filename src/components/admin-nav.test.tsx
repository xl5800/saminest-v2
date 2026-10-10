import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 功能改动清单第 7 项：AdminNav 新增"待审核"/"举报处理"两个角标，分别走
// countPendingPosts/countPendingReports（见 admin-nav.tsx 顶部注释）。
// 这个组件被 7 个管理页面共用，之前完全不依赖 Supabase，这里第一次给它的
// 测试引入 repository mock，理由跟 pending-posts-page.test.tsx 等文件里
// 新加的最小 mock 一致——不 mock 会真的调用 getSupabaseClient()（测试环境
// 没有配置真实连接信息，会抛错，虽然 react-query 会把它当成一次查询失败
// 吞掉，不会让测试崩溃，但显式 mock 才能真正验证角标的渲染逻辑）。
const { countPendingPosts, countPendingReports } = vi.hoisted(() => ({
  countPendingPosts: vi.fn(),
  countPendingReports: vi.fn()
}));

vi.mock("../repositories/posts-repository", () => ({
  countPendingPosts
}));
vi.mock("../repositories/reports-repository", () => ({
  countPendingReports
}));

import { renderWithProviders } from "../test/render-with-providers";
import { AdminNav } from "./admin-nav";

describe("AdminNav", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    countPendingPosts.mockReset().mockResolvedValue(0);
    countPendingReports.mockReset().mockResolvedValue(0);
  });

  it("renders all 7 admin destination links", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(7);
    expect(screen.getByRole("link", { name: "社区申请" })).toHaveAttribute(
      "href",
      "/admin/communities"
    );
    expect(screen.getByRole("link", { name: "待审核" })).toHaveAttribute(
      "href",
      "/admin/posts"
    );
    expect(screen.getByRole("link", { name: "全部帖子" })).toHaveAttribute(
      "href",
      "/admin/posts/all"
    );
    expect(screen.getByRole("link", { name: "举报处理" })).toHaveAttribute(
      "href",
      "/admin/reports"
    );
    // 联系客服改成真聊天任务卡："联系客服"这一项换成了"客服"，指向
    // /admin/support（客服会话列表）而不是 /admin/feedback，见
    // admin-nav.tsx 顶部注释。
    expect(screen.getByRole("link", { name: "客服" })).toHaveAttribute(
      "href",
      "/admin/support"
    );
    expect(screen.getByRole("link", { name: "用户管理" })).toHaveAttribute(
      "href",
      "/admin/users"
    );
    expect(screen.getByRole("link", { name: "分类管理" })).toHaveAttribute(
      "href",
      "/admin/categories"
    );
  });

  it("marks '客服' as active with aria-current on /admin/support", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/support"] });

    expect(screen.getByRole("link", { name: "客服" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks '待审核' as active with aria-current on /admin/posts", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

    expect(screen.getByRole("link", { name: "待审核" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "全部帖子" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  // "/admin/posts" 是 "/admin/posts/all" 的字符串前缀——这条测试专门守住
  // AdminNav 用的是精确匹配，不是 bottom-nav.tsx 那种前缀匹配，避免"全部
  // 帖子"页面时"待审核"这个 tab 被误判成同时激活。
  it("marks only '全部帖子' as active on /admin/posts/all, not '待审核'", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts/all"] });

    expect(screen.getByRole("link", { name: "全部帖子" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "待审核" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks '举报处理' as active with aria-current on /admin/reports", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/reports"] });

    expect(screen.getByRole("link", { name: "举报处理" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks '用户管理' as active with aria-current on /admin/users", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/users"] });

    expect(screen.getByRole("link", { name: "用户管理" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks '分类管理' as active with aria-current on /admin/categories", () => {
    renderWithProviders(<AdminNav />, { initialEntries: ["/admin/categories"] });

    expect(screen.getByRole("link", { name: "分类管理" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  // 功能改动清单第 7 项（README 管理后台小节："待审核、举报处理、客服显示
  // 红色计数角标（选中时角标白底蓝字）"）。用 screen.getByText(label).closest("a")
  // 而不是 getByRole("link", { name: "..." }) 定位这几个 tab——角标是链接
  // 文字后面紧跟的另一个子节点，不同浏览器/可访问性库对"链接可访问名称"
  // 里两段文字之间要不要插入空格的算法细节不完全一致，用标签文字本身定位
  // 更稳定，不依赖这个细节。
  describe("红色计数角标", () => {
    it("shows a red, white-text badge with the count on 待审核 when it is not the active tab", async () => {
      countPendingPosts.mockResolvedValue(3);
      renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts/all"] });

      const link = screen.getByText("待审核").closest("a") as HTMLElement;
      // 用 findByText（而不是 getByText）等待 countPendingPosts 这个异步
      // mock 真正 resolve、组件重新渲染出角标——渲染的第一刻这个查询还是
      // pending 状态，角标要等一轮微任务之后才会出现。
      const badge = await within(link).findByText("3");
      expect(badge).toHaveClass("bg-danger");
      expect(badge).toHaveClass("text-white");
    });

    it("shows a white, blue-text badge on 待审核 when it is the active tab", async () => {
      countPendingPosts.mockResolvedValue(5);
      renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

      const link = screen.getByText("待审核").closest("a") as HTMLElement;
      const badge = await within(link).findByText("5");
      expect(badge).toHaveClass("bg-white");
      expect(badge).toHaveClass("text-primary");
    });

    it("does not render a badge on 待审核 when the count resolves to 0", () => {
      countPendingPosts.mockResolvedValue(0);
      renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

      // 无论查询还在 pending（这一刻）还是已经 resolve 成 0，角标都不应该
      // 出现，不需要特意等待 resolve——两种状态下断言都成立。
      const link = screen.getByText("待审核").closest("a") as HTMLElement;
      expect(within(link).queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    it("shows a badge with the count on 举报处理 driven by countPendingReports independently of countPendingPosts", async () => {
      countPendingPosts.mockResolvedValue(0);
      countPendingReports.mockResolvedValue(2);
      renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

      const reportsLink = screen.getByText("举报处理").closest("a") as HTMLElement;
      await within(reportsLink).findByText("2");

      const pendingLink = screen.getByText("待审核").closest("a") as HTMLElement;
      expect(within(pendingLink).queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    it("never renders a badge on 全部帖子/客服/用户管理/分类管理, regardless of the counts", async () => {
      countPendingPosts.mockResolvedValue(9);
      countPendingReports.mockResolvedValue(9);
      renderWithProviders(<AdminNav />, { initialEntries: ["/admin/posts"] });

      // 等"待审核"角标出现，代表两个查询都已经 resolve 完，此时再检查其它
      // 四个 tab 确实没有被误挂上角标。
      await within(screen.getByText("待审核").closest("a") as HTMLElement).findByText("9");

      for (const label of ["全部帖子", "客服", "用户管理", "分类管理"]) {
        const link = screen.getByText(label).closest("a") as HTMLElement;
        expect(within(link).queryByText(/^\d+$/)).not.toBeInTheDocument();
      }
    });
  });
});
