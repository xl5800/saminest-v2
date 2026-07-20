import { Outlet } from "react-router-dom";

import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

/**
 * 根布局路由的 element：给每一个页面路由外层套上持久的顶部导航栏
 * （AppHeader）和移动端底部导航栏（BottomNav），中间用 <Outlet />
 * 渲染当前匹配到的子路由。见 routes.tsx。
 */
export function AppShell() {
  return (
    <>
      <AppHeader />
      <Outlet />
      <BottomNav />
    </>
  );
}
