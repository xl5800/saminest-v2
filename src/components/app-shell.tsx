import { matchPath, Outlet, useLocation, useMatches } from "react-router-dom";

import { useOnlineStatus } from "../utils/use-online-status";
import { AppHeader } from "./app-header";
import { BottomNav } from "./bottom-nav";

/**
 * 登录/注册/忘记密码/重置密码这四个认证页面用自己的 AuthLayout 渲染精简版
 * 顶部栏、自己处理"不需要底部导航"，不是靠这里对全局 AppHeader/BottomNav
 * 做条件渲染再改它们——所以这几条路径也归进"完全沉浸式"，不渲染全站
 * chrome，跟会话详情页是同一个道理。
 *
 * Meet5 风格改版（docs/saminest_codex_reference_pack/design-reference/）
 * 之后，这里的"完全沉浸式"名单还多了一类新成员：以后陆续迁移到 TopBar
 * `create` 变体的创建/表单类页面（发布搭子内容、发布帖子，见 05 号卡）——
 * 规则表要求这类页面 AppHeader 和 BottomNav 都不要，语义上跟认证页面一样
 * 是"完全沉浸式"，所以统一放进同一个名单，不用单独再建一个"沉浸式"分类。
 *
 * 用 matchPath（不是 useMatch）遍历多个路径模式——useMatch 是 hook，
 * 不能在循环/数组里逐个调用；matchPath 是普通函数，可以对任意多个模式
 * 挨个测试，会话详情页 /messages/:conversationId 这种带参数的动态路径
 * 模式也能表达，不用像以前那样单独为它写一个 useMatch。
 */
const NO_CHROME_PATTERNS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/messages/:conversationId",
  // 04 号卡（find-buddy-flow）：发布搭子内容表单，创建流程页面，AppHeader
  // 和 BottomNav 都不要。
  "/activities/new",
  // 05 号卡（publish-flow）：发布帖子表单（新建 /publish、编辑 /publish/:id
  // 共用同一个 PublishPage），创建流程页面，AppHeader 和 BottomNav 都不要。
  "/publish",
  "/publish/:id",
  // 23 号卡（帖子详情页顶部+操作区改版）：从 TOPBAR_MIGRATED_PATTERNS 挪
  // 过来——21 号卡当初给这个页面加的是 TopBar nav-only 变体（一条常规的
  // 返回箭头顶栏，跟其它保留 BottomNav 的页面同一类）；这次连 TopBar 都不
  // 用了，改成悬浮在图片上的关闭按钮（页面自己渲染，不是全局组件），底部
  // 也从 BottomNav 换成页面自己的常驻"咨询"大按钮——AppHeader、BottomNav
  // 现在都不需要，这个页面自己就是唯一的 chrome，语义上跟发布表单这类
  // 沉浸式页面是同一类，不是"顶部栏换了、底部 Tab 栏还在"那种了。
  "/post/:id",
  // 联系客服改成真聊天任务卡：管理员客服会话详情页照抄
  // /messages/:conversationId 那套全屏聊天布局（自己的返回按钮+输入框，
  // 没有 TopBar/AppHeader/BottomNav 的容身之处），归进完全沉浸式——跟
  // /messages/:conversationId 是同一类，不是"顶部栏换了、底部 Tab 栏
  // 还在"。/admin/support 那张列表页不在这里，它是常规的 TopBar
  // nav-only + AdminNav 页面，见下面 TOPBAR_MIGRATED_PATTERNS。
  "/admin/support/:conversationId"
];

/**
 * 已经迁移到自己的 TopBar（home/tab/detail/nav-only 四种变体之一）的
 * 页面：不再需要全局 AppHeader（页面自己在内容顶部渲染 TopBar），但仍然
 * 保留 BottomNav——这些都是"能在 5 个 Tab 之间跳转"的常规浏览场景，跟上面
 * NO_CHROME_PATTERNS 那种完全沉浸式是两回事，不能用同一个开关控制。
 *
 * 这是这次改版专门要解决的问题：01 号卡落地 TopBar 组件之前，这个文件
 * 只有一个 isImmersive 开关同时控制 AppHeader 和 BottomNav 两个组件，
 * 没法表达"只换掉顶部栏、继续保留底部导航"这种情况——如果直接照抄旧开关
 * 的写法，02 号卡把首页新加进"沉浸式"名单，会把首页的 BottomNav 也一起
 * 关掉，这是错的（对照 saminest_final_screens.html 的⑥找搭子详情、⑧
 * 发起者主页、⑪地区选择这几屏，都是"顶部栏换了、底部 Tab 栏还在"）。
 *
 * 02 号卡只迁移了首页（"/"）。03～06 号卡迁移各自负责的页面时，把对应
 * 路径模式加进这个数组就够，不需要再碰这个文件里的判断逻辑本身。
 *
 * 04 号卡（find-buddy-flow）新加了三条：找搭子列表（/activities）、找
 * 搭子详情（/activities/:id）、发起者主页（/users/:userId）——这三个都是
 * "顶部栏换了、底部 Tab 栏还在"的常规浏览场景（对照 saminest_final_screens.html
 * ③⑥⑧三屏），不是沉浸式；真正沉浸式的发布搭子内容表单在上面
 * NO_CHROME_PATTERNS 里。
 *
 * 03 号卡（category-tab）新加一条：分类 Tab 页（/categories）——同样是
 * "顶部栏换了、底部 Tab 栏还在"的常规浏览场景（对照
 * saminest_final_screens.html ②屏），不是沉浸式。
 *
 * 06 号卡（profile-region-misc）新加三条：我的（/profile）、消息
 * （/messages）、地区选择（/region-select）——分别对照
 * saminest_final_screens.html ⑤④⑪三屏，都是"顶部栏换了、底部 Tab 栏
 * 还在"的常规场景，不是沉浸式（地区选择虽然是从首页州名点进来的二级
 * 导航页，但设计稿⑪屏本身也带着底部 Tab 栏，不属于 NO_CHROME_PATTERNS
 * 那种完全沉浸式）。
 *
 * 21 号卡（二级页面顶部栏简化）新加两条：我的活动（/my-activities）、
 * 我的收藏（/favorites）——这两个页面之前一直沿用改版前的全局 AppHeader
 * （品牌名+发布按钮那一版），这次改成各自渲染自己的 TopBar nav-only
 * 变体（纯返回箭头，不显示标题/品牌/发布按钮），因此也要挪进这个名单，
 * 跟其它已迁移页面一样只关掉 AppHeader、保留 BottomNav——这两个页面本来
 * 就有底部 Tab 栏，不是沉浸式表单页。21 号卡当时把帖子详情页
 * （/post/:id）也一起加了同一个 nav-only 处理，但 23 号卡把它整个换成
 * 完全沉浸式了，见上面 NO_CHROME_PATTERNS 里 23 号卡那条注释，这里不再
 * 保留它。
 *
 * 26 号卡（18 条旧 AppHeader 路由统一迁移到 TopBar）：25 号卡调研确认，
 * 除了上面这些之外，还有 18 条路由一直沿用改版前的全局 AppHeader（品牌名
 * +发布按钮），逐条判断下来品牌名和发布按钮在这些页面上都没有实际用处，
 * 只有"返回"是真正需要的，这次统一挪进这个名单、各自渲染 TopBar 的
 * nav-only 变体（带 title，不带品牌/发布按钮）：
 * 三个举报页（/activities/:id/report、/post/:id/report、
 * /users/:userId/report）、意见反馈（/feedback）、编辑个人资料
 * （/profile/edit）、设置页（/settings、/settings/delete-account）、
 * 已屏蔽用户列表（/blocked-users）、六个后台管理页（/admin/posts、
 * /admin/posts/all、/admin/reports、/admin/feedback、/admin/users、
 * /admin/categories）、用户协议（/terms）、隐私政策（/privacy）。其中
 * /my-posts（我的帖子）单独多传了一个 nav-only 新增的可选 `right` 图标
 * 按钮（见 top-bar.tsx 里 TopBarNavOnlyProps 的注释），保留了一个"发布"
 * 入口，但换成小图标样式，不再是旧 AppHeader 那种大按钮——这 18 条路由都
 * 本来就有底部 Tab 栏（举报页/编辑资料/设置这类二级页面也是从有底部 Tab
 * 栏的页面跳过来的），不属于完全沉浸式，因此也是挪进这个名单而不是
 * NO_CHROME_PATTERNS。（26 号卡当时把 404 兜底页也用字面量 "*" 塞进了
 * 这个数组——这是个 bug，见下面 hasOwnTopBar 的说明，这次已经改掉。）
 *
 * "*" 通配符 bug 修复 + 补登记 /activities/:id/notify：这个数组用
 * matchesAnyPattern（内部是 matchPath({ path: pattern, end: true }, ...)）
 * 逐条测试，而 matchPath 对 pattern 是字面量 "*" 的语义是"匹配任意
 * pathname"，不是"只匹配真的没有命中任何具体路由、落到 404 的那种特殊
 * 情况"——26 号卡当初往这个数组末尾加的那条 "*"（本意是给 404 兜底页也
 * 标记"已经有自己的 TopBar"）实际效果是让 hasOwnTopBar 对全站任意路径都
 * 恒为 true，连带 showAppHeader 恒为 false，下面注释里"其余尚未迁移的
 * 页面，AppHeader/BottomNav 都渲染"这条分支因此变成永远走不到的死代码。
 * 现在改成：数组里不再放 "*"，404 兜底页改用 useMatches() + routes.tsx
 * 里那个路由对象的显式 id（"not-found"）单独判断，可靠地只匹配"真的没有
 * 命中任何具体路由"这一种情况，见下面 isNotFoundRoute 的注释。
 *
 * 顺带补登记了一条之前漏掉的路由：/activities/:id/notify（发起人群发
 * 通知参与者页，见 activity-notify-page.tsx）——这个页面从任务卡 4 落地
 * 起就一直无条件渲染自己的 TopBar nav-only 变体，但从来没有被加进这个
 * 数组，只是因为上面那个 "*" bug"误打误撞"让 hasOwnTopBar 对它也是
 * true，没有露出双重顶部栏；bug 修好之后如果不补上这一条，这个页面会
 * 立刻变成"旧 AppHeader + 自己的 TopBar"同时渲染，所以这次一并补上，放
 * 在同样是"活动详情页子路由"的 /activities/:id/report 旁边。
 */
const TOPBAR_MIGRATED_PATTERNS = [
  "/",
  "/activities",
  "/activities/:id",
  "/users/:userId",
  "/categories",
  "/profile",
  "/messages",
  "/region-select",
  "/my-activities",
  "/favorites",
  // 26 号卡新增：
  "/activities/:id/report",
  // 任务卡（修复 "*" 通配符 bug + 补登记本条）：activity-notify-page.tsx
  // 从任务卡 4 落地起就一直无条件渲染自己的 TopBar nav-only 变体，之前
  // 漏登记，见本文件顶部这次改动的说明。
  "/activities/:id/notify",
  "/post/:id/report",
  "/users/:userId/report",
  "/feedback",
  "/profile/edit",
  "/settings",
  "/settings/delete-account",
  "/blocked-users",
  "/my-posts",
  "/admin/posts",
  "/admin/posts/all",
  "/admin/reports",
  "/admin/feedback",
  // 联系客服改成真聊天任务卡：客服会话列表页，普通的 TopBar nav-only +
  // AdminNav 页面（跟这个数组里其它 admin 页面同一类）。会话详情页
  // （/admin/support/:conversationId）不在这里，是全屏沉浸式聊天布局，
  // 见 NO_CHROME_PATTERNS 的说明。
  "/admin/support",
  "/admin/users",
  "/admin/categories",
  "/terms",
  "/privacy"
];

function matchesAnyPattern(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null);
}

/**
 * 根布局路由的 element：
 * - 完全沉浸式页面（NO_CHROME_PATTERNS）：AppHeader、BottomNav 都不渲染，
 *   页面自己是唯一的 chrome。
 * - 已迁移到 TopBar 的页面（TOPBAR_MIGRATED_PATTERNS，或者真的落到了 404
 *   兜底页）：不渲染 AppHeader（页面自己渲染 TopBar），但渲染 BottomNav。
 * - 其余尚未迁移的页面：维持改版前的行为，AppHeader、BottomNav 都渲染。
 *
 * isNotFoundRoute 用 useMatches() 拿到当前渲染的路由树、找 routes.tsx 里
 * 那个显式标了 `id: "not-found"` 的通配路由对象——用路由本身的 id 判断
 * "这是不是真的落到 404 了"，不是拿 location.pathname 字符串去跟一个
 * "*" pattern 做 matchPath 比对。这两种判断方式看起来像是同一件事，实际
 * 语义完全不同：matchPath({ path: "*" }, pathname) 对任意 pathname 都会
 * 匹配上（"*" 表示"匹配一切"，不是"只匹配未命中的情况"），这正是
 * TOPBAR_MIGRATED_PATTERNS 数组之前出的那个 bug——见该数组顶部注释。
 * useMatches() 返回的每一项对应路由树里一层匹配到的路由，只有真的落到
 * 那个通配路由（其它路由都没匹配上）时，`matches` 里才会出现
 * `id === "not-found"` 的一项，不会有歧义。
 *
 * 断网提示条放在这里（而不是每个页面各自处理）：这是全站所有路由共用的
 * 外层组件，一处判断就能覆盖所有页面，包括完全沉浸式页面——网络断开这件事
 * 跟"当前是不是沉浸式页面"无关，永远渲染在最上面。这一轮只做一条简单的
 * 状态提示（见 use-online-status.ts），不做离线缓存/ Service Worker。
 */
export function AppShell() {
  const location = useLocation();
  const matches = useMatches();
  const isOnline = useOnlineStatus();

  const isNotFoundRoute = matches.some((match) => match.id === "not-found");

  const isNoChrome = matchesAnyPattern(location.pathname, NO_CHROME_PATTERNS);
  const hasOwnTopBar =
    matchesAnyPattern(location.pathname, TOPBAR_MIGRATED_PATTERNS) || isNotFoundRoute;

  const showAppHeader = !isNoChrome && !hasOwnTopBar;
  const showBottomNav = !isNoChrome;

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
      {showAppHeader ? <AppHeader /> : null}
      <Outlet />
      {showBottomNav ? <BottomNav /> : null}
    </>
  );
}
