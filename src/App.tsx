import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";

import { queryClient } from "./app/query-client";
import { hideSplashScreen } from "./app/splash-screen";
import { useAuthBootstrap } from "./app/use-auth-bootstrap";
import { router } from "./router/routes";
import { useAuthStore } from "./store/auth-store";

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
    <QueryClientProvider client={queryClient}>
      {isInitializing ? (
        <div role="status">正在加载...</div>
      ) : (
        <RouterProvider router={router} />
      )}
    </QueryClientProvider>
  );
}
