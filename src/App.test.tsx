import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { hideSplashScreen } = vi.hoisted(() => ({ hideSplashScreen: vi.fn() }));
vi.mock("./app/splash-screen", () => ({ hideSplashScreen }));

import { App } from "./App";

vi.mock("./integrations/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })
    }
  })
}));

describe("App", () => {
  afterEach(() => {
    cleanup();
    hideSplashScreen.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("shows a loading state, then mounts the router at the home page", async () => {
    render(<App />);

    expect(screen.getByRole("status")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("home-page")).toBeInTheDocument();
    });
  });

  // 启动图：打开的不是首页时，登录状态恢复完成就收起（不等那个页面自己的
  // 数据）；首页由 home-page.tsx 等第一屏数据再收起（见 home-page.test.tsx）。
  it("hides the splash screen once auth is restored when the app opens on a page other than home", async () => {
    window.history.replaceState(null, "", "/login");
    render(<App />);

    await waitFor(() => {
      expect(hideSplashScreen).toHaveBeenCalled();
    });
  });
});
