import { Outlet, useMatch } from "react-router-dom";

import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

/**
 * 根布局路由的 element：普通页面使用持久的 AppHeader 和 BottomNav；
 * 单个会话页是沉浸式二级页面，由页面自身渲染聊天 Header 和输入栏，因此
 * 只在精确匹配 /messages/:conversationId 时不渲染全站 chrome。
 */
export function AppShell() {
  const isConversationDetail = useMatch({
    path: "/messages/:conversationId",
    end: true
  });

  return (
    <>
      {!isConversationDetail ? <AppHeader /> : null}
      <Outlet />
      {!isConversationDetail ? <BottomNav /> : null}
    </>
  );
}
