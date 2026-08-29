import {
  Ban,
  Calendar,
  FileText,
  MessageSquare,
  Settings,
  Shield,
  Star,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ProfileSummary } from "../../components/profile-summary";
import { useIsAdminQuery } from "../../features/admin/use-is-admin-query";
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
  to: string;
  icon: LucideIcon;
  label: string;
}

function GroupRow({ to, icon: Icon, label }: GroupRowProps) {
  return (
    <Link
      to={to}
      className="flex h-14 items-center justify-between px-4 text-base font-medium text-text transition-opacity hover:opacity-90"
    >
      <span className="flex items-center gap-3">
        <Icon aria-hidden="true" size={20} className="shrink-0 text-text-muted" />
        <span>{label}</span>
      </span>
      <span aria-hidden="true" className="text-[18px] leading-none text-chevron">
        ›
      </span>
    </Link>
  );
}

/**
 * 24 号卡新增：把若干 GroupRow 收进同一张白色圆角卡片——"我的内容"
 * （我的活动/已屏蔽）和"账号与服务"（帮助与客服/设置/后台管理）各自是
 * 一张。divide-y 在行之间画分隔线，overflow-hidden 保证子行不会盖住卡片
 * 自己的圆角（子行本身是矩形，没有裁切的话直角会露在圆角外面，跟
 * activity-card.tsx 处理方形头像格铺满卡片时用的是同一个理由）。
 */
function GroupCard({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 divide-y divide-border overflow-hidden rounded-2xl bg-white shadow-settings-item">
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
 * 见上面第 4 点。
 *
 * 24.3/24.4 功能列表：原来铺平的 SettingsRow 列表拆成两张 GroupCard——
 * "我的内容"（我的活动/已屏蔽）、"账号与服务"（帮助与客服/设置/
 * 后台管理，后台管理仅管理员可见）。"联系客服"这一行本身的路由
 * （/feedback）没有变，只是文案按任务卡要求改成"帮助与客服"。
 *
 * 24.5 退出登录：改成单独一张白色圆角卡片、红色文字、居中，不再是原来
 * 那个描边按钮。
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.session)?.user.id;

  const { data: profile, isPending, isError } = useMyProfileQuery();
  const { data: isAdmin } = useIsAdminQuery();

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
        {isPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}
        {isError ? (
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            用户信息加载失败，请稍后重试。
          </p>
        ) : null}

        {!isPending && !isError ? (
          <div className="mb-6">
            <ProfileSummary
              size="compact"
              displayName={profile?.displayName ?? null}
              avatarUrl={profile?.avatarUrl ?? null}
              avatarHref={currentUserId ? `/users/${currentUserId}` : undefined}
              editHref="/profile/edit"
            >
              <div className="mt-3 grid grid-cols-2 divide-x divide-border">
                <Link
                  to="/my-posts"
                  className="flex flex-col items-center gap-1 py-2 text-center hover:opacity-80"
                >
                  <FileText aria-hidden="true" size={18} className="text-text-muted" />
                  <span className="text-xs text-text-muted">我的发布</span>
                </Link>
                <Link
                  to="/favorites"
                  className="flex flex-col items-center gap-1 py-2 text-center hover:opacity-80"
                >
                  <Star aria-hidden="true" size={18} className="text-text-muted" />
                  <span className="text-xs text-text-muted">我的收藏</span>
                </Link>
              </div>
            </ProfileSummary>
          </div>
        ) : null}

        <nav aria-label="我的内容">
          <GroupCard>
            <GroupRow to="/my-activities" icon={Calendar} label="我的活动" />
            <GroupRow to="/blocked-users" icon={Ban} label="已屏蔽" />
          </GroupCard>
        </nav>

        <nav aria-label="账号与服务">
          <GroupCard>
            <GroupRow to="/feedback" icon={MessageSquare} label="帮助与客服" />
            <GroupRow to={SETTINGS_PATH} icon={Settings} label="设置" />
            {isAdmin === true ? (
              <GroupRow to="/admin/posts" icon={Shield} label="后台管理" />
            ) : null}
          </GroupCard>
        </nav>

        {logoutError ? (
          <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {logoutError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-white text-base font-medium text-danger shadow-settings-item transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? "退出中…" : "退出登录"}
        </button>
      </div>
    </main>
  );
}
