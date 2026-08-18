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

  it("shows the offline banner on immersive routes too (not gated by isImmersive)", () => {
    setNavigatorOnLine(false);

    renderShell("/login");

    expect(screen.getByRole("alert")).toHaveTextContent("网络连接已断开");
    expect(
      screen.queryByRole("navigation", { name: "底部导航" })
    ).not.toBeInTheDocument();
  });
});
