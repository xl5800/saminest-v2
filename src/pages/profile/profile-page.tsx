import {
  Ban,
  Calendar,
  FileText,
  MessageSquare,
  Pencil,
  Settings,
  Shield,
  Star,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ProfileSummary } from "../../components/profile-summary";
import { Skeleton } from "../../components/skeleton";
import { useIsAdminQuery } from "../../features/admin/use-is-admin-query";
import { useContactSupport } from "../../features/conversations/use-contact-support";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { authService } from "../../services/auth/auth-service";
import { useAuthStore } from "../../store/auth-store";

const LOGOUT_ERROR_MESSAGE = "退出登录失败，请稍后重试。";

/**
 * "设置"入口的目标路径——06 号卡当初挂在 TopBar 右上角的齿轮图标上，
 * 11 号卡把整个 TopBar 都拆掉了，这个常量本身不用改（routes.tsx 里已经
 * 是真正的 /settings 页面，不再是占位路由），只是现在从分组卡片里的一行
 * 触发，不再是顶栏图标按钮触发。
 */
const SETTINGS_PATH = "/settings";

/**
 * 24 号卡（"我的"页面改版）新增：分组卡片里的一行——跟改版前的
 * SettingsRow 是同一个"图标+文案+chevron"结构，区别是这一行不再自带
 * 圆角/白底/阴影/下外边距（那些现在由 GroupCard 统一套在整组外面），
 * 行与行之间的分隔线也是 GroupCard 用 divide-y 统一处理，不是每一行各自
 * 加 border-bottom。
 */
interface GroupRowProps {
  /** 静态路由目标，跟 onClick 二选一——传了 to 就渲染成 <Link>（原有的
   *  唯一形态，行为不变）。 */
  to?: string;
  /** 联系客服改成真聊天任务卡新增：传了 onClick 就渲染成 <button>，给
   *  "帮助与客服"这一行用——目标不再是一个固定路由，要先调用
   *  get_or_create_own_system_conversation() 拿到会话 id 再跳转，不能用
   *  静态的 <Link to="...">。这个组件只有这两种调用方式，不强制用 TS
   *  联合类型把 to/onClick 做成互斥（多加一层类型体操换来的安全性对
   *  两个调用方来说不值得），调用方自己保证传且只传其中一个。 */
  onClick?: () => void;
  icon: LucideIcon;
  label: string;
}

function GroupRow({ to, onClick, icon: Icon, label }: GroupRowProps) {
  // 修复"帮助与客服"chevron 贴字/分隔线变短任务卡：上面那条"两者都是 flex
  // 天然撑满父级宽度"的假设对 <button> 不成立——表单控件（<button>/
  // <input>/<select>）有一条特殊的尺寸规则，即使设了 display: flex，宽度
  // 依然按内容算（intrinsic sizing），不会像 <div>/<a> 那样自动撑满父容器。
  // <button> 分支（"帮助与客服"这一行）因此比其它 <Link> 行窄，chevron
  // 贴着文字、下面 divide-y 画出的分隔线也跟着变短。补上 w-full 让
  // <button> 真正撑满卡片宽度；text-left 是保险起见一起加的（部分浏览器
  // <button> 默认 text-align: center，这里内容是两个 flex 子元素理论上不
  // 受影响，顺手加上不会有副作用）。两个 class 加在共用的 className 里
  // 对 <Link> 分支是 no-op——<Link> 本来就已经是撑满宽度的块级元素、
  // 默认左对齐，不会改变它现在的视觉效果。
  const className =
    "flex h-14 w-full items-center justify-between px-4 text-left text-base font-medium text-text transition-opacity hover:opacity-90";
  const content = (
    <>
      <span className="flex items-center gap-3">
        <Icon aria-hidden="true" size={20} className="shrink-0 text-text-muted" />
        <span>{label}</span>
      </span>
      <span aria-hidden="true" className="text-[18px] leading-none text-chevron">
        ›
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * 24 号卡新增：把若干 GroupRow 收进同一张白色圆角卡片——"我的内容"
 * （我的活动/已屏蔽）和"账号与服务"（帮助与客服/设置/后台管理）各自是
 * 一张。divide-y 在行之间画分隔线，overflow-hidden 保证子行不会盖住卡片
 * 自己的圆角（子行本身是矩形，没有裁切的话直角会露在圆角外面，跟
 * activity-card.tsx 处理方形头像格铺满卡片时用的是同一个理由）。
 *
 * 全 App 视觉 Token 体系（第二批）：分隔线从 divide-border 换成
 * divide-divider——这是"行与行之间"的列表分割线场景（跟第一批
 * conversation-list-page.tsx 同一个语义），不是卡片自己的边框（这张卡片
 * 本身没有描边，只有 shadow-settings-item 投影），所以用专门的列表分割线
 * token，不是卡片边框 token。
 */
function GroupCard({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 divide-y divide-divider overflow-hidden rounded-2xl bg-card shadow-settings-item">
      {children}
    </div>
  );
}

/**
 * "我的"标签页目标页面（/profile，路由已在 routes.tsx 用 RequireAuth
 * 包裹，这里不做登录检查/跳转，符合 CLAUDE.md 的统一规则）。
 *
 * 是否管理员复用现有的 useIsAdminQuery（RequireAdmin 也在用同一个
 * hook），不重新实现一遍角色判断逻辑——这次改动没有碰这段判断本身，只是
 * 把它保留在新的页面结构里。
 *
 * 24 号卡（"我的"页面改版）：
 *
 * 24.1 调查结论（先读代码，不要假设）：
 * 1. 顶部栏：这个页面本来就没有地区 pill + 搜索栏（11 号卡已经把 TopBar
 *    整个删掉了，见下面保留的旧注释）——任务卡描述的"顶部现在有地区选择+
 *    搜索栏"跟当前代码不符，这次没有额外要删的顶部内容，24.2.1
 *    "去掉地区pill+搜索栏"这一条本来就已经满足，不需要改动。
 * 2. 各入口路由：编辑资料 /profile/edit、我的发布 /my-posts、我的活动
 *    /my-activities、我的收藏 /favorites、联系客服(→帮助与客服) /feedback、
 *    已屏蔽 /blocked-users、设置 /settings、后台管理 /admin/posts——全部
 *    是改版前就有的现成路由，这次只是重新分组摆放位置，没有新增/修改任何
 *    路由。
 * 3. "后台管理"权限判断：改版前就已经是 `isAdmin === true` 才渲染这一行
 *    （用 useIsAdminQuery，和 RequireAdmin 路由守卫共用同一个 hook/同一套
 *    admin/super_admin 角色判断），不是"所有登录用户都能看到，点进去才被
 *    拦截"。这次直接照搬这个既有判断，放进新的"账号与服务"分组卡片里，
 *    没有新增任何权限逻辑。
 * 4. 我的发布/我的收藏这一条最初一版用 useMyPostsQuery()/
 *    useFavoritePostIdsQuery() 取 .length 当数字展示（仓库里没有专门的
 *    计数接口/字段，是复用现成的、拉全量数据的查询现算出来的）——用户
 *    反馈这两个数字不需要显示，改成了下面这版：两个纯文字+图标的可点击
 *    入口（FileText/Star，跟改版前 SettingsRow 列表里这两行用的是同一对
 *    图标），不再调用这两个 hook。useMyPostsQuery 继续给 /my-posts 页面
 *    用、useFavoritePostIdsQuery 继续给 FavoriteButton 等其它调用方用，
 *    这两个 hook 本身没有删——只是这个页面不再多发一次仅仅为了数个数的
 *    请求。
 *
 * 11 号卡（我的页面收尾）历史注释（顶栏精简部分依然成立，见上面 24.1.1）：
 * TopBar（06 号卡加的 tab 变体，标题"我的" + 设置齿轮）整个删掉，这个
 * 页面顶部不再有任何独立顶栏——AppShell 早就因为 06 号卡把"/profile"加进
 * 了 TOPBAR_MIGRATED_PATTERNS（关掉全局 AppHeader），现在页面自己也不
 * 渲染 TopBar 了，两层都没有，内容区域直接从状态栏下方开始。
 *
 * 视觉上没有可见的"我的"标题文字，但页面仍然需要一个语义 <h1> landmark，
 * 用 sr-only 隐藏视觉展示，只保留给屏幕阅读器。
 *
 * 24.2 头像卡片：ProfileSummary 的 compact 变体这次改了内部结构（见
 * profile-summary.tsx）——不再传 bio（简介行去掉了），改传 editHref 让
 * 卡片右上角出现一个编辑资料铅笔图标（原来列表里单独一行的"编辑资料"
 * 因此从下面的分组卡片里去掉了），children 传一条"我的发布/我的收藏"
 * 两栏入口——ProfileSummary 会把 children 直接摆在头像/昵称/编辑图标
 * 那一行下面，中间不加分割线（24.2.2 明确要求）。avatarHref 维持不变
 * （11 号卡加的，头像本身仍然可以点进自己的公开主页预览）。这两栏入口
 * 不展示数字，只是图标+文字，点击行为不变（跳 /my-posts、/favorites），
 * 见上面第 4 点。（下面"加回简介+年龄"任务卡把这两栏入口整个挪出了
 * ProfileSummary，见该段说明，这里保留是历史记录，不代表当前状态。）
 *
 * 加回简介+年龄任务卡：BARRY 用 Claude Design 画的新 mockup 确认，24 号
 * 卡当时为了精简删掉的简介+年龄这两行需要加回来——ProfileSummary 新增
 * bio/age 两个可选 prop（各自独立判空渲染，见该组件注释），profile-page.tsx
 * 这次传 profile?.bio ?? null / profile?.age ?? null，不用改数据层
 * （useMyProfileQuery 背后的 getMyProfile() 早就在查这两列）。同一张
 * 任务卡还把"我的发布/我的收藏"从身份卡内部的两栏图标按钮，改成跟"我的
 * 活动/已屏蔽"一样的整行 GroupRow——不再通过 ProfileSummary 的 children
 * 传入，挪到身份卡下面单独一张 GroupCard（"我的发布与收藏"，在"我的
 * 内容"卡片之前），直接复用文件里已有的 GroupRow/GroupCard，不新写样式。
 *
 * 24.3/24.4 功能列表：原来铺平的 SettingsRow 列表拆成两张 GroupCard——
 * "我的内容"（我的活动/已屏蔽）、"账号与服务"（帮助与客服/设置/
 * 后台管理，后台管理仅管理员可见）。"联系客服"这一行本身的路由
 * （/feedback）没有变，只是文案按任务卡要求改成"帮助与客服"。
 *
 * 24.5 退出登录：改成单独一张白色圆角卡片、红色文字、居中，不再是原来
 * 那个描边按钮。
 *
 * 公开主页 Facebook 风格头图改版（联动）：头像卡片右上角那个图标按钮的
 * 语义变了——原来是 editHref（编辑资料铅笔），这次换成 profileHref
 * （查看个人主页，指向 `/users/:currentUserId`）。"编辑资料"这个入口
 * 没有消失，只是从卡片右上角挪到了下面"账号与服务"分组卡片的第一行
 * （GroupRow to="/profile/edit"）——路由、点击行为、目标页面都没变，
 * 纯粹是入口位置的调整。
 *
 * 整卡可点 + 铅笔编辑角标任务卡：ProfileSummary 右上角那个"查看个人
 * 主页"圆形图标按钮又被去掉了（BARRY 反馈容易被误认成头像加载失败的
 * 占位图标），改成整张身份卡可点（还是跳同一个 profileHref），右侧换成
 * 纯装饰的 `›` 箭头；"编辑资料"这次挪回了头像右下角的一个铅笔角标（跟
 * 下面"账号与服务"卡片里的"编辑个人信息"行是同一个目标 /profile/edit
 * 的两个入口，双重入口是有意保留，不是冲突，理由跟之前 avatarHref/
 * profileHref 同指一个目标是同一个道理）——`avatarHref` 这个 prop 因此
 * 被整个删掉了：整卡都跳 profileHref 之后，头像自己单独再包一层 Link
 * 已经没有必要，继续保留还会导致头像的 Link 嵌套在整卡可点击区域内部
 * 这种"可点击区域嵌套可点击区域"的问题，见 profile-summary.tsx 的注释。
 *
 * 联系客服改成真聊天任务卡："帮助与客服"这一行不再是跳 /feedback 表单页
 * 的静态 <Link>，改成 <GroupRow onClick={contactSupport}>——contactSupport
 * （useContactSupport() 这个共享 hook，见该文件注释）负责调用
 * get_or_create_own_system_conversation() 拿到/建出自己的客服会话 id，
 * 再跳到 /messages/:conversationId，直接进聊天界面。GroupRow 因此新增了
 * 一个 onClick 可选 prop（跟 to 二选一），这次是唯一的 onClick 调用方，
 * 其它所有行都还是原来的静态 <Link to="...">，行为完全不变。/feedback
 * 这个路由/页面本身没有删——只是从此没有任何入口指向它了，历史提交的
 * 反馈数据继续留着，不影响现有代码。
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.session)?.user.id;

  const { data: profile, isPending, isError } = useMyProfileQuery();
  const { data: isAdmin } = useIsAdminQuery();
  const { contactSupport, error: contactSupportError } = useContactSupport();

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout(): Promise<void> {
    setLogoutError(null);
    setIsLoggingOut(true);
    try {
      await authService.signOut();
      navigate("/");
    } catch {
      setLogoutError(LOGOUT_ERROR_MESSAGE);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen pb-20 md:pb-6">
      <h1 className="sr-only">我的</h1>

      <div className="mx-auto max-w-md px-4 pb-6 pt-3.5">
        {/* 高频页面骨架屏任务卡：这个页面不是列表，是 ProfileSummary 渲染
            的个人资料头部——占位给同一种"资料头部"形状，不是列表行。外层
            卡片 class 照抄 profile-summary.tsx 真实用的
            rounded-profile-card bg-card p-3.5，头像占位尺寸跟 ProfileSummary
            实际用的 h-14 w-14/56px 一致，旁边昵称行占位 + 下方 1-2 行简介
            占位。sr-only 文字保留原来的无障碍播报，骨架块本身是纯视觉
            装饰。 */}
        {isPending ? (
          <div role="status" className="mb-6">
            <span className="sr-only">加载中…</span>
            <div className="rounded-profile-card bg-card p-3.5">
              <div className="flex items-center">
                <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
                <Skeleton className="ml-3.5 h-4 w-1/3" />
              </div>
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-1.5 h-4 w-2/3" />
            </div>
          </div>
        ) : null}
        {isError ? (
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            用户信息加载失败，请稍后重试。
          </p>
        ) : null}

        {!isPending && !isError ? (
          <div className="mb-6">
            <ProfileSummary
              displayName={profile?.displayName ?? null}
              avatarUrl={profile?.avatarUrl ?? null}
              profileHref={currentUserId ? `/users/${currentUserId}` : undefined}
              bio={profile?.bio ?? null}
              age={profile?.age ?? null}
            />
          </div>
        ) : null}

        {/* 加回简介+年龄任务卡：我的发布/我的收藏从身份卡内部的两栏图标
            按钮（原来通过 children 传给 ProfileSummary），改成跟"我的
            活动/已屏蔽"一样的整行 GroupRow，挪到身份卡下面单独一张
            GroupCard——不并进"我的内容"那张卡片里，是单独一张。 */}
        <nav aria-label="我的发布与收藏">
          <GroupCard>
            <GroupRow to="/my-posts" icon={FileText} label="我的发布" />
            <GroupRow to="/favorites" icon={Star} label="我的收藏" />
          </GroupCard>
        </nav>

        <nav aria-label="我的内容">
          <GroupCard>
            <GroupRow to="/my-activities" icon={Calendar} label="我的活动" />
            <GroupRow to="/blocked-users" icon={Ban} label="已屏蔽" />
          </GroupCard>
        </nav>

        <nav aria-label="账号与服务">
          <GroupCard>
            <GroupRow to="/profile/edit" icon={Pencil} label="编辑个人信息" />
            <GroupRow onClick={contactSupport} icon={MessageSquare} label="帮助与客服" />
            <GroupRow to={SETTINGS_PATH} icon={Settings} label="设置" />
            {isAdmin === true ? (
              <GroupRow to="/admin/posts" icon={Shield} label="后台管理" />
            ) : null}
          </GroupCard>
        </nav>
        {/* 联系客服改成真聊天任务卡：contactSupport 失败时的错误提示——
            正常路径下这个 mutation 几乎不会失败（只是拿/建一条属于自己的
            会话），这里跟其它入口一样兜底展示一条通用错误，不留静默失败。 */}
        {contactSupportError ? (
          <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {contactSupportError}
          </p>
        ) : null}

        {logoutError ? (
          <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {logoutError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-card text-base font-medium text-danger shadow-settings-item transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? "退出中…" : "退出登录"}
        </button>
      </div>
    </main>
  );
}
