import { Outlet, useLocation, useMatch } from "react-router-dom";

import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

/**
 * 登录/注册/忘记密码/重置密码这四个认证页面用自己的 AuthLayout 渲染精简版
 * 顶部栏、自己处理"不需要底部导航"，不是靠这里对全局 AppHeader/BottomNav
 * 做条件渲染再改它们——所以这几条路径也归进"沉浸式页面"，不渲染全局
 * chrome，跟会话详情页是同一个道理。
 */
const IMMERSIVE_PATHS = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);

/**
 * 根布局路由的 element：普通页面使用持久的 AppHeader 和 BottomNav；
 * 沉浸式二级页面（会话详情页、四个认证页面）由页面自身渲染顶部栏/输入栏，
 * 因此不渲染全站 chrome。
 */
export function AppShell() {
  const location = useLocation();
  const isConversationDetail = useMatch({
    path: "/messages/:conversationId",
    end: true
  });
  const isImmersive = Boolean(isConversationDetail) || IMMERSIVE_PATHS.has(location.pathname);

  return (
    <>
      {!isImmersive ? <AppHeader /> : null}
      <Outlet />
      {!isImmersive ? <BottomNav /> : null}
    </>
  );
}
