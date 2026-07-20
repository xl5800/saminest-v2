import { Link, useLocation } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
}

const LEFT_ITEMS: NavItem[] = [
  { to: "/", label: "首页" },
  { to: "/categories", label: "分类" }
];

const RIGHT_ITEMS: NavItem[] = [
  { to: "/messages", label: "消息" },
  { to: "/profile", label: "我的" }
];

const PUBLISH_ITEM: NavItem = { to: "/publish", label: "发布" };

/**
 * 跟 CategoryNav 用 aria-current="page" 标记当前激活项是同一个约定，这里
 * 沿用而不是发明新的高亮方式。"/" 只在完全匹配时才算激活（否则每个路径都
 * 会命中它），其余项支持前缀匹配，覆盖类似 /messages/:conversationId
 * 嵌套在 /messages 下面的场景。
 */
function isActivePath(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * 移动端底部导航栏，由 AppShell 包在每一个路由外层渲染，md 以上隐藏
 * （桌面端导航走 AppHeader）。
 *
 * 这里只负责渲染 <Link>，不做任何登录态判断/跳转——"发布/消息/我的"点击后
 * 是否需要登录，完全交给 routes.tsx 里已经/即将包在这些路径外层的
 * RequireAuth 处理，不在组件内部重复判断，符合 CLAUDE.md 的硬性规则。
 */
export function BottomNav() {
  const location = useLocation();

  function renderItem(item: NavItem) {
    const active = isActivePath(location.pathname, item.to);
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center justify-center py-2 text-xs ${
          active ? "font-semibold text-primary" : "text-text-muted"
        }`}
      >
        {item.label}
      </Link>
    );
  }

  const publishActive = isActivePath(location.pathname, PUBLISH_ITEM.to);

  return (
    <nav
      aria-label="底部导航"
      className="fixed inset-x-0 bottom-0 z-10 flex items-center border-t border-border bg-bg md:hidden"
    >
      {LEFT_ITEMS.map(renderItem)}
      <Link
        to={PUBLISH_ITEM.to}
        aria-current={publishActive ? "page" : undefined}
        className="flex flex-1 flex-col items-center justify-center"
      >
        <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-sm font-semibold text-text shadow-md">
          {PUBLISH_ITEM.label}
        </span>
      </Link>
      {RIGHT_ITEMS.map(renderItem)}
    </nav>
  );
}
