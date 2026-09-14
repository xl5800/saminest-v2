import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
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
// 任务卡（修复 "*" 通配符 bug + 补登记 /activities/:id/notify）：AppShell
// 内部现在用 useMatches() 判断是不是落到了 404 兜底页，而 useMatches 只能
// 在"data router"里用（createBrowserRouter/createMemoryRouter +
// RouterProvider），普通的 <MemoryRouter>/<Routes>/<Route> 不提供这个
// 上下文，会直接抛 invariant 错误——所以这里改成跟 app-header.test.tsx
// 同一个模式：createMemoryRouter + RouterProvider，路由结构用普通对象
// 而不是 JSX <Route>。通配兜底路由额外标了 `id: "not-found"`，跟真实
// routes.tsx 里那个路由对象保持一致，这样 useMatches() 才能在测试里也
// 找到它。
//
// "/totally-unmigrated" 这条路径故意不在 app-shell.tsx 的
// NO_CHROME_PATTERNS/TOPBAR_MIGRATED_PATTERNS 任何一个数组里，但在下面
// 这棵路由树里有真实对应的路由（不会落到 404）——代表"确实还没迁移的
// 页面"，用来验证 AppShell 的第三条分支（AppHeader/BottomNav 都渲染）
// 真的还能被触发到。这个场景在真实 app 里已经不存在了（routes.tsx 里
// 每条路由都已经在两个数组之一，或者页面自己无条件渲染了 TopBar），这里
// 保留只是为了证明"*" bug 修复之后 AppHeader 分支不再是永远走不到的死
// 代码——bug 修复前，TOPBAR_MIGRATED_PATTERNS 数组末尾那条字面量 "*" 会
// 让 matchesAnyPattern 对包括 "/totally-unmigrated" 在内的任意路径都
// 返回 true，这条测试当时是不可能通过的。
function renderShell(path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <p>page content</p> },
          { path: "login", element: <p>login page</p> },
          { path: "categories", element: <p>categories page</p> },
          { path: "profile", element: <p>profile page</p> },
          { path: "messages", element: <p>messages page</p> },
          { path: "region-select", element: <p>region-select page</p> },
          { path: "my-activities", element: <p>my-activities page</p> },
          { path: "favorites", element: <p>favorites page</p> },
          { path: "post/:id", element: <p>post-detail page</p> },
          // 26 号卡新迁移的 17 条 nav-only 路由 + 单独处理的 /my-posts，
          // stub 元素只需要能渲染、不需要还原真实页面内容。
          { path: "activities/:id/report", element: <p>report-activity page</p> },
          // 任务卡（补登记本条）：activity-notify-page.tsx 一直无条件渲染
          // 自己的 TopBar，之前漏登记，见 app-shell.tsx 顶部注释。
          { path: "activities/:id/notify", element: <p>activity-notify page</p> },
          { path: "post/:id/report", element: <p>report-post page</p> },
          { path: "users/:userId/report", element: <p>report-user page</p> },
          { path: "feedback", element: <p>feedback page</p> },
          { path: "profile/edit", element: <p>edit-profile page</p> },
          { path: "settings", element: <p>settings page</p> },
          { path: "settings/delete-account", element: <p>delete-account page</p> },
          { path: "blocked-users", element: <p>blocked-users page</p> },
          { path: "my-posts", element: <p>my-posts page</p> },
          { path: "admin/posts", element: <p>admin-posts page</p> },
          { path: "admin/posts/all", element: <p>admin-all-posts page</p> },
          { path: "admin/reports", element: <p>admin-reports page</p> },
          { path: "admin/feedback", element: <p>admin-feedback page</p> },
          { path: "admin/users", element: <p>admin-users page</p> },
          { path: "admin/categories", element: <p>admin-categories page</p> },
          { path: "terms", element: <p>terms page</p> },
          { path: "privacy", element: <p>privacy page</p> },
          // 故意不在两个数组里的一条真实路由（不是 404），验证第三条分支
          // （尚未迁移页面，AppHeader/BottomNav 都渲染）没有变成死代码。
          { path: "totally-unmigrated", element: <p>unmigrated page</p> },
          // routes.tsx 真实的通配兜底路由（NotFoundPage）——id 跟真实路由
          // 保持一致，任何不匹配以上路径的 pathname 都会落到这里。
          { id: "not-found", path: "*", element: <p>not-found page</p> }
        ]
      }
    ],
    { initialEntries: [path] }
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
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
    // 任务卡（修复 "*" 通配符 bug）："/other" 在上面这棵测试路由树里没有
    // 对应的具体路由，会真的落到那个标了 id: "not-found" 的通配路由——
    // AppShell 现在用 useMatches() 找这个 id（不是拿 pathname 字符串去跟
    // 一个 "*" pattern 做 matchPath），可靠地识别"这是真的 404"，同样只
    // 渲染 NotFoundPage 自己的 TopBar，不叠加 AppHeader，BottomNav 正常
    // 渲染（这条页面本来就有底部 Tab 栏，不是沉浸式）。
    it("renders BottomNav but NOT AppHeader on a path that matches no route at all (falls through to NotFoundPage)", () => {
      renderShell("/this-route-does-not-exist");

      expect(screen.getByText("not-found page")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
    });

    // 任务卡（活动详情页——发起人不能报名自己的活动 + "已加入"名单加头像/
    // 简介）的姊妹卡：/activities/:id/notify 一直无条件渲染自己的 TopBar，
    // 但之前漏登记进 TOPBAR_MIGRATED_PATTERNS，只是被 "*" bug 意外掩盖了，
    // 见 app-shell.tsx 顶部注释。这里单独验证补登记之后行为正确：只有它
    // 自己的内容，没有叠加 AppHeader，BottomNav 正常渲染（跟其它"活动详情
    // 页子路由"同一类，不是沉浸式）。
    it("renders BottomNav but NOT AppHeader on the newly-registered \"/activities/:id/notify\" page", () => {
      renderShell("/activities/123/notify");

      expect(screen.getByText("activity-notify page")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Saminest" })).not.toBeInTheDocument();
      expect(screen.getByRole("navigation", { name: "底部导航" })).toBeInTheDocument();
    });

    // 这条测试证明的是 bug 修复本身，不是任何一个真实路由的行为（真实
    // routes.tsx 里已经不存在"两个数组都没登记、页面也没有自己 TopBar"
    // 这第三种情况了，见 app-shell.tsx 顶部注释）："/totally-unmigrated"
    // 在上面路由树里是一个真实存在、但故意没登记进任何数组的路由——bug
    // 修复前，TOPBAR_MIGRATED_PATTERNS 数组末尾那条字面量 "*" 会让
    // matchesAnyPattern 对它也返回 true，AppHeader 因此永远渲染不出来；
    // 修复后这条路径应该走到"其余尚未迁移的页面"分支，AppHeader/BottomNav
    // 都渲染。
    it("renders AppHeader (and BottomNav) again on a genuinely un-migrated route — proves the \"*\" bug no longer swallows this branch", () => {
      renderShell("/totally-unmigrated");

      expect(screen.getByText("unmigrated page")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Saminest" })).toBeInTheDocument();
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
