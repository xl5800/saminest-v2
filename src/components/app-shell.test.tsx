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
// "/other" 这条路径故意不在 app-shell.tsx 的 NO_CHROME_PATTERNS/
// TOPBAR_MIGRATED_PATTERNS 任何一个名单里，用来代表"还没被 02～06 号卡
// 迁移的旧页面"，验证改版前的行为（AppHeader + BottomNav 都渲染）在
// 迁移过程中继续保持不变。
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
            <Route path="other" element={<p>other page</p>} />
            <Route path="categories" element={<p>categories page</p>} />
            <Route path="profile" element={<p>profile page</p>} />
            <Route path="messages" element={<p>messages page</p>} />
            <Route path="region-select" element={<p>region-select page</p>} />
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
    it("renders both AppHeader and BottomNav on a not-yet-migrated legacy page", () => {
      renderShell("/other");

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
  });
});
