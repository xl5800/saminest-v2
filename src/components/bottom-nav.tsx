import { Handshake, Home, LayoutGrid, MessageCircle, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useHasPendingActivityParticipantsQuery } from "../features/activities/use-has-pending-activity-participants-query";
import { useHasUnreadSystemNotificationQuery } from "../features/conversations/use-has-unread-system-notification-query";

interface NavItem {
  to: string;
  label: string;
  Icon: typeof Home;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "首页", Icon: Home },
  { to: "/categories", label: "分类", Icon: LayoutGrid },
  { to: "/activities", label: "找搭子", Icon: Handshake },
  { to: "/messages", label: "消息", Icon: MessageCircle },
  { to: "/profile", label: "我的", Icon: UserRound }
];

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
 * 5 个平级目的地，没有中间的"发布"圆形按钮——全局发布入口已经统一收到
 * AppHeader 右上角（点开 Action Sheet 选发布类型，见 publish-action-sheet.tsx），
 * 底部导航只负责"去哪"，不再混一个"做什么"的操作型按钮进来，跟其它 4 个
 * 目的地的语义保持一致，也避免同一个"发布"动作在 App 里出现两个入口。
 *
 * 图标用 lucide-react（项目里第一次引入图标库——之前全站图标位置一直是用
 * emoji 直接代替，如活动频道🍜🚗、收藏★☆，这次是产品明确要的"简洁年轻"
 * 底部 Tab 视觉，emoji 在不同系统/字体下渲染差异较大，跟 5 个纯目的地
 * Tab 一起用线性 SVG 图标观感更统一、更接近现代 App 标准做法，经用户
 * 确认后引入）。
 *
 * 图标+文字都用同一个 text-primary（选中）/text-text-muted（未选中）
 * 颜色类控制，不需要给 <Icon> 单独传颜色 prop——lucide 图标默认
 * `stroke="currentColor"`，跟随父级文字颜色。
 *
 * 安全区适配：iOS Safari 底部有 Home Indicator，贴底固定定位的导航栏如果
 * 不额外让出这块区域，图标文字会紧贴/被系统手势条遮挡——这个问题之前只在
 * conversation-page.tsx 的消息输入框底部用内联样式
 * `calc(0.75rem + env(safe-area-inset-bottom))` 处理过，这里用等价的
 * Tailwind 任意值写法表达同一个 calc()，不新建自定义 spacing token（这里
 * 只有这一处用得到，不值得为它单独定义一个 --spacing-* 变量）。
 *
 * "消息"这一项的图标右上角有一个未读系统通知的小红点（
 * useHasUnreadSystemNotificationQuery），只在这一项渲染，用
 * to === "/messages" 判断，不是给所有 5 个目的地都加这个能力——目前只有
 * 系统通知这一种未读概念，没有理由为其它 4 项也预留同一套逻辑。红点是
 * aria-hidden，"消息"这个文字标签本身已经是可访问名称，红点只是纯视觉
 * 强调，不需要额外的无障碍文案（比如"有未读消息"）。
 *
 * 30 号卡（打通"活动申请通知"到审核页面的跳转）：同样的红点模式又加了
 * 一个——"我的"图标（to === "/profile"）用
 * useHasPendingActivityParticipantsQuery 判断当前用户名下有没有任意未
 * 处理的活动报名申请，跟"消息"图标的未读红点是完全独立的两个判断，互不
 * 影响，只是恰好用的是同一套 UI 呈现（同一个 absolute 定位的小红点）。
 */
export function BottomNav() {
  const location = useLocation();
  const { data: hasUnread } = useHasUnreadSystemNotificationQuery();
  const { data: hasPendingApproval } = useHasPendingActivityParticipantsQuery();

  return (
    <nav
      aria-label="底部导航"
      className="fixed inset-x-0 bottom-0 z-10 flex items-center border-t border-border bg-bg pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 md:hidden"
    >
      {NAV_ITEMS.map(({ to, label, Icon }) => {
        const active = isActivePath(location.pathname, to);
        const showUnreadDot = to === "/messages" && hasUnread === true;
        const showPendingApprovalDot = to === "/profile" && hasPendingApproval === true;
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-xs ${
              active ? "font-semibold text-primary" : "text-text-muted"
            }`}
          >
            <span className="relative">
              <Icon aria-hidden="true" size={22} strokeWidth={active ? 2.5 : 2} />
              {showUnreadDot || showPendingApprovalDot ? (
                <span
                  aria-hidden="true"
                  data-testid={showUnreadDot ? "unread-dot" : "pending-approval-dot"}
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger"
                />
              ) : null}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
