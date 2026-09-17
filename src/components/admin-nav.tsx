import { Link, useLocation } from "react-router-dom";

interface AdminNavItem {
  to: string;
  label: string;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin/posts", label: "待审核" },
  { to: "/admin/posts/all", label: "全部帖子" },
  { to: "/admin/reports", label: "举报处理" },
  // 联系客服改成真聊天任务卡：原来指向 /admin/feedback（一次性表单提交
  // 队列）的这一项换成 /admin/support（客服会话列表），文案从"联系客服"
  // 改成"客服"——从管理员视角这不再是"联系"谁，是"处理"客服会话，跟
  // "举报处理"这类动词化命名保持一致。/admin/feedback 这个路由/页面本身
  // 没有删，只是从此没有任何导航入口指向它了，见 routes.tsx 的说明。
  { to: "/admin/support", label: "客服" },
  { to: "/admin/users", label: "用户管理" },
  { to: "/admin/categories", label: "分类管理" }
];

/**
 * 管理后台共享的顶部 tab 导航条。六个管理页面（待审核帖子、全部帖子、举报
 * 处理、客服会话列表、用户管理、分类管理）各自在页面顶部渲染这同一个组件，
 * 横向切换不用退回个人资料页重新点"后台管理"入口——鉴权仍然各自由页面路由
 * （RequireAuth）和数据层 RLS/is_admin() 兜底，这里只负责导航，不重复做
 * 权限判断。
 *
 * 联系客服改成真聊天任务卡："联系客服反馈"这一项换成"客服"（指向
 * /admin/support，客服会话列表），见 ADMIN_NAV_ITEMS 数组上面的注释。
 * 那个列表点进一条会话之后是独立的会话详情页（/admin/support/:id），
 * 那个页面不渲染这个导航条（照抄 /messages/:conversationId 沉浸式聊天
 * 页的全屏布局，没有 AdminNav 这种页面顶部横向 tab 的容身之处），不影响
 * 这里"六个管理路由都是平级、没有再往下的详情子路由"这条假设——那条假设
 * 说的是这个导航条自己列出的六个目的地，不是"admin 下所有页面都不能有
 * 详情子路由"。
 *
 * 用精确匹配（pathname === to）判断激活项，不用 bottom-nav.tsx 那种前缀
 * 匹配——"/admin/posts" 是 "/admin/posts/all" 的前缀，如果用前缀匹配会导致
 * 停在"全部帖子"页面时"待审核"这个 tab 也被误判成激活状态。六个管理路由都是
 * 平级、没有再往下的详情子路由，精确匹配已经足够。
 *
 * 视觉上沿用 category-nav.tsx 的横向可滚动胶囊 tab（overflow-x-auto + 圆角
 * 胶囊 + aria-current="page"），不用固定网格布局，方便以后管理页面变多时
 * 不用重新设计这个组件。
 */
export function AdminNav() {
  const location = useLocation();

  const inactiveClassName =
    "flex h-9 items-center justify-center rounded-full border border-border bg-bg px-4 text-sm whitespace-nowrap text-text-muted";
  const activeClassName =
    "flex h-9 items-center justify-center rounded-full px-4 text-sm whitespace-nowrap bg-primary text-white font-semibold";

  return (
    <nav aria-label="管理后台导航" className="mb-4 flex gap-2 overflow-x-auto">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={active ? activeClassName : inactiveClassName}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
