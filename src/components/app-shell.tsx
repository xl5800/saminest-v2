import { matchPath, Outlet, useLocation } from "react-router-dom";

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
  "/post/:id"
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
 * /admin/categories）、用户协议（/terms）、隐私政策（/privacy）、404 兜底页
 * （*）。其中 /my-posts（我的帖子）单独多传了一个 nav-only 新增的可选
 * `right` 图标按钮（见 top-bar.tsx 里 TopBarNavOnlyProps 的注释），保留了
 * 一个"发布"入口，但换成小图标样式，不再是旧 AppHeader 那种大按钮——这 18
 * 条路由都本来就有底部 Tab 栏（举报页/编辑资料/设置这类二级页面也是从
 * 有底部 Tab 栏的页面跳过来的），不属于完全沉浸式，因此也是挪进这个名单
 * 而不是 NO_CHROME_PATTERNS。
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
  "/admin/users",
  "/admin/categories",
  "/terms",
  "/privacy",
  "*"
];

function matchesAnyPattern(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null);
}

/**
 * 根布局路由的 element：
 * - 完全沉浸式页面（NO_CHROME_PATTERNS）：AppHeader、BottomNav 都不渲染，
 *   页面自己是唯一的 chrome。
 * - 已迁移到 TopBar 的页面（TOPBAR_MIGRATED_PATTERNS）：不渲染 AppHeader
 *   （页面自己渲染 TopBar），但渲染 BottomNav。
 * - 其余尚未迁移的页面：维持改版前的行为，AppHeader、BottomNav 都渲染。
 *
 * 断网提示条放在这里（而不是每个页面各自处理）：这是全站所有路由共用的
 * 外层组件，一处判断就能覆盖所有页面，包括完全沉浸式页面——网络断开这件事
 * 跟"当前是不是沉浸式页面"无关，永远渲染在最上面。这一轮只做一条简单的
 * 状态提示（见 use-online-status.ts），不做离线缓存/ Service Worker。
 */
export function AppShell() {
  const location = useLocation();
  const isOnline = useOnlineStatus();

  const isNoChrome = matchesAnyPattern(location.pathname, NO_CHROME_PATTERNS);
  const hasOwnTopBar = matchesAnyPattern(location.pathname, TOPBAR_MIGRATED_PATTERNS);

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
