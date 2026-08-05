import { Outlet, useLocation, useMatch } from "react-router-dom";

import { useOnlineStatus } from "../utils/use-online-status";
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
 *
 * 断网提示条放在这里（而不是每个页面各自处理）：这是全站所有路由共用的
 * 外层组件，一处判断就能覆盖所有页面，包括沉浸式页面——网络断开这件事
 * 跟"当前是不是沉浸式页面"无关，不受 isImmersive 影响，永远渲染在最上面。
 * 这一轮只做一条简单的状态提示（见 use-online-status.ts），不做离线缓存/
 * Service Worker，不让 App 具备离线可用能力。
 */
export function AppShell() {
  const location = useLocation();
  const isConversationDetail = useMatch({
    path: "/messages/:conversationId",
    end: true
  });
  const isImmersive = Boolean(isConversationDetail) || IMMERSIVE_PATHS.has(location.pathname);
  const isOnline = useOnlineStatus();

  return (
    <>
      {!isOnline ? (
        <div
          role="alert"
          className="bg-danger px-4 py-2 text-center text-sm font-medium text-white"
        >
          网络连接已断开
        </div>
      ) : null}
      {!isImmersive ? <AppHeader /> : null}
      <Outlet />
      {!isImmersive ? <BottomNav /> : null}
    </>
  );
}
