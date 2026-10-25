import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";

import { queryClient } from "./app/query-client";
import { createPersistOptions } from "./app/query-persistence";
import { hideSplashScreen } from "./app/splash-screen";
import { useAuthBootstrap } from "./app/use-auth-bootstrap";
import { AppUpdateSheet } from "./components/app-update-sheet";
import { router } from "./router/routes";
import { useAuthStore } from "./store/auth-store";

// 原生感 A 批：冷启动先显示上次的公开列表，后台再刷新，见 app/query-persistence.ts。
const persistOptions = createPersistOptions();

export function App() {
  useAuthBootstrap();
  const isInitializing = useAuthStore((s) => s.isInitializing);

  // 启动图：打开的不是首页时，登录状态恢复完成就收起；首页要等第一屏数据，
  // 由 home-page.tsx 自己收起。见 app/splash-screen.ts。
  useEffect(() => {
    if (!isInitializing && window.location.pathname !== "/") {
      hideSplashScreen();
    }
  }, [isInitializing]);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {isInitializing ? (
        <div role="status">正在加载...</div>
      ) : (
        <RouterProvider router={router} />
      )}
      {/* 新版本提示：只在 iOS 原生壳里、App Store 有更高版本时出现，见 app/app-update-check.ts */}
      <AppUpdateSheet />
    </PersistQueryClientProvider>
  );
}
