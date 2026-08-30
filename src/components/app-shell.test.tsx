import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value
  });
}

// BottomNav 现在会调用 useHasUnreadSystemNotificationQuery()（未读系统
// 通知红点），这是这棵组件树里第一次出现 useQuery，需要一个
// QueryClientProvider 祖先，否则渲染直接报错——没有登录 session 时这个
// 查询本身是 enabled: false（不会真的发请求），所以这里只需要提供
// QueryClientProvider，不需要额外 mock 掉 conversations-repository。
//
// 26 号卡之前，"/other" 这条路径故意不在 app-shell.tsx 的
// NO_CHROME_PATTERNS/TOPBAR_MIGRATED_PATTERNS 任何一个名单里，用来代表
// "还没被迁移的旧页面"，验证改版前的行为（AppHeader + BottomNav 都渲染）
// 在迁移过程中继续保持不变。26 号卡把最后剩下的 18 条路由（含通配的 *
// 兜底路由，对应真实 routes.tsx 里的 NotFoundPage）也迁移进了
// TOPBAR_MIGRATED_PATTERNS，"/other" 现在会命中这条通配规则、不再代表
// "未迁移页面"——这个场景在真实 app 里已经不存在了：任何不匹配已知路由的
// 路径，routes.tsx 自己也会落到同样已经迁移过的 NotFoundPage，不会有第三种
// "两个名单都没覆盖"的情况。下面这条测试改成验证这个通配兜底行为本身。
function renderShell(path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/*" element={<AppShell />}>
            <Route index element={<p>page content</p>} />
            <Route path="login" element={<p>login page</p>} />
            <Route path="categories" element={<p>categories page</p>} />
            <Route path="profile" element={<p>profile page</p>} />
            <Route path="messages" element={<p>messages page</p>} />
            <Route path="region-select" element={<p>region-select page</p>} />
            <Route path="my-activities" element={<p>my-activities page</p>} />
            <Route path="favorites" element={<p>favorites page</p>} />
            <Route path="post/:id" element={<p>post-detail page</p>} />
            {/* 26 号卡新迁移的 17 条 nav-only 路由 + 单独处理的 /my-posts，
                stub 元素只需要能渲染、不需要还原真实页面内容。 */}
            <Route path="activities/:id/report" element={<p>report-activity page</p>} />
            <Route path="post/:id/report" element={<p>report-post page</p>} />
            <Route path="users/:userId/report" element={<p>report-user page</p>} />
            <Route path="feedback" element={<p>feedback page</p>} />
            <Route path="profile/edit" element={<p>edit-profile page</p>} />
            <Route path="settings" element={<p>settings page</p>} />
            <Route path="settings/delete-account" element={<p>delete-account page</p>} />
            <Route path="blocked-users" element={<p>blocked-users page</p>} />
            <Route path="my-posts" element={<p>my-posts page</p>} />
            <Route path="admin/posts" element={<p>admin-posts page</p>} />
            <Route path="admin/posts/all" element={<p>admin-all-posts page</p>} />
            <Route path="admin/reports" element={<p>admin-reports page</p>} />
            <Route path="admin/feedback" element={<p>admin-feedback page</p>} />
            <Route path="admin/users" element={<p>admin-users page</p>} />
            <Route path="admin/categories" element={<p>admin-categories page</p>} />
            <Route path="terms" element={<p>terms page</p>} />
            <Route path="privacy" element={<p>privacy page</p>} />
            {/* routes.tsx 真实的通配兜底路由（NotFoundPage）——任何不匹配
                以上路径的 pathname 都会落到这里，"/other" 也不例外。 */}
            <Route path="*" element={<p>not-found page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    cleanup();
    setNavigatorOnLine(true);
  });

  it("does not show the offline banner while online", () => {
    renderShell();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a '网络连接已断开' banner when navigator.onLine is false", () => {
    setNavigatorOnLine(false);

    renderShell();

    expect(screen.getByRole("alert")).toHaveTextContent("网络连接已断开");
  });

  it("shows the offline banner on fully-immersive routes too (not gated by chrome visibility)", () => {
    setNavigatorOnLine(false);

    renderShell("/login");

    expect(screen.getByRole("alert")).toHaveTextContent("网络连接已断开");
    expect(
      screen.queryByRole("navigation", { name: "底部导航" })
    ).not.toBeInTheDocument();
  });

  describe("AppHeader / BottomNav visibility — decoupled per Meet5 改版 (01/02 号卡)", () => {
    // 26 号卡：TOPBAR_MIGRATED_PATTERNS 里的通配 "*" 现在会兜住任何不匹配
    // 已知路由的 pathname（对应真实 routes.tsx 里已经迁移过的
    // NotFoundPage），"/other" 这种任意路径不再会渲染 AppHeader——这是
    // 26 号卡迁移最后一批路由之后，AppHeader 分支在真实 app 里已经不可能
    // 再被触发到的直接后果，见上面 renderShell 的注释。
    it("renders BottomNav but NOT AppHeader on an unmatched path (falls through to the migrated wildcard NotFoundPage)", () => {
      renderShell("/other");

      expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
    });

    it("renders neither AppHeader nor BottomNav on a fully-immersive page (/login)", () => {
      renderShell("/login");

      expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();
    });

    // 这是这次改版要解决的核心问题：一个页面换用了自己的 TopBar（不再需要
    // 全局 AppHeader），不代表它也不需要 BottomNav——两者必须是独立判断，
    // 不能像改版前那样共用一个开关。首页（"/"）是 02 号卡唯一迁移的路径。
    it("renders BottomNav but NOT AppHeader on a page that has migrated to its own TopBar (home, \"/\")", () => {
      renderShell("/");

      expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
    });

    // 03 号卡（category-tab）：分类 Tab 页也迁移到了自己的 TopBar。
    it("renders BottomNav but NOT AppHeader on the migrated categories tab page (\"/categories\")", () => {
      renderShell("/categories");

      expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
    });

    // 06 号卡（profile-region-misc）：我的/消息/地区选择三个页面也迁移到了
    // 自己的 TopBar，同样只关 AppHeader、留着 BottomNav。
    it.each([
      ["/profile", "profile page"],
      ["/messages", "messages page"],
      ["/region-select", "region-select page"]
    ])(
      "renders BottomNav but NOT AppHeader on the migrated \"%s\" page",
      (path) => {
        renderShell(path);

        expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
      }
    );

    // 21 号卡（二级页面顶部栏简化）：我的活动/我的收藏两个页面换成了自己的
    // TopBar nav-only 变体，同样只关 AppHeader、留着 BottomNav。帖子详情页
    // 当时也在这个名单里，23 号卡把它挪进了完全沉浸式，见下面单独的用例。
    it.each([
      ["/my-activities", "my-activities page"],
      ["/favorites", "favorites page"]
    ])(
      "renders BottomNav but NOT AppHeader on the migrated \"%s\" page",
      (path) => {
        renderShell(path);

        expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
      }
    );

    // 23 号卡（帖子详情页顶部+操作区改版）：不再是"顶部栏换了、底部 Tab
    // 栏还在"，页面自己的悬浮关闭按钮 + 常驻"咨询"大按钮取代了 AppHeader/
    // BottomNav 两者，归进完全沉浸式——用 "/post/123" 而不是裸的
    // "/post/:id" 验证 matchPath 对动态路径参数也生效。
    it("renders neither AppHeader nor BottomNav on the fully-immersive post detail page (\"/post/123\")", () => {
      renderShell("/post/123");

      expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "底部导航" })).not.toBeInTheDocument();
    });

    // 26 号卡（18 条旧 AppHeader 路由统一迁移到 TopBar）：这 18 条路由全部
    // 换成了各自的 TopBar nav-only 变体，同样只关 AppHeader、留着
    // BottomNav——用 "/activities/123/report" 这种带参数的路径验证
    // matchPath 对动态段也生效，跟 "/post/123" 是同一个理由。
    it.each([
      ["/activities/123/report", "report-activity page"],
      ["/post/123/report", "report-post page"],
      ["/users/123/report", "report-user page"],
      ["/feedback", "feedback page"],
      ["/profile/edit", "edit-profile page"],
      ["/settings", "settings page"],
      ["/settings/delete-account", "delete-account page"],
      ["/blocked-users", "blocked-users page"],
      ["/my-posts", "my-posts page"],
      ["/admin/posts", "admin-posts page"],
      ["/admin/posts/all", "admin-all-posts page"],
      ["/admin/reports", "admin-reports page"],
      ["/admin/feedback", "admin-feedback page"],
      ["/admin/users", "admin-users page"],
      ["/admin/categories", "admin-categories page"],
      ["/terms", "terms page"],
      ["/privacy", "privacy page"]
    ])(
      "renders BottomNav but NOT AppHeader on the migrated \"%s\" page",
      (path) => {
        renderShell(path);

        expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
      }
    );
  });
});
