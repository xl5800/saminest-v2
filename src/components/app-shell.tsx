import { Outlet, useMatch } from "react-router-dom";

import { AppFooter } from "./app-footer";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

/**
 * 根布局路由的 element：普通页面使用持久的 AppHeader、AppFooter 和
 * BottomNav；单个会话页是沉浸式二级页面，由页面自身渲染聊天 Header 和
 * 输入栏，因此只在精确匹配 /messages/:conversationId 时不渲染全站
 * chrome——页脚也不例外，否则"用户协议/隐私政策"链接会挤在聊天输入框
 * 上方，跟沉浸式设计的初衷矛盾。
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
      {!isConversationDetail ? <AppFooter /> : null}
      {!isConversationDetail ? <BottomNav /> : null}
    </>
  );
}
