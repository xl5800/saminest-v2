import { Link } from "react-router-dom";

/**
 * 全站页脚，由 AppShell 跟 AppHeader/BottomNav 一样在 Outlet 外层渲染，
 * 是否渲染（沉浸式会话详情页不渲染）由 AppShell 统一判断，这里不重复
 * 实现一遍路由匹配逻辑。
 *
 * BottomNav 在移动端是 fixed bottom-0（md:hidden），页脚如果不自己留出
 * 底部空间，滚动到页面最底部时会被这个悬浮导航栏挡住——这里复用全站其它
 * 页面"pb-20 md:pb-6"的模式（桌面端 BottomNav 隐藏，不需要留白），而不是
 * 发明新的间距规则。
 */
export function AppFooter() {
  return (
    <footer className="border-t border-border px-4 py-6 pb-20 md:pb-6">
      <nav
        aria-label="页脚"
        className="flex flex-wrap justify-center gap-4 text-sm text-text-muted"
      >
        <Link to="/terms" className="hover:text-primary">
          用户协议
        </Link>
        <Link to="/privacy" className="hover:text-primary">
          隐私政策
        </Link>
        <Link to="/feedback" className="hover:text-primary">
          意见反馈
        </Link>
      </nav>
    </footer>
  );
}
