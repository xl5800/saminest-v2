import {
  Ban,
  Calendar,
  FileText,
  MessageSquare,
  Pencil,
  Settings,
  Star,
  type LucideIcon
} from "lucide-react";
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
 * 是真正的 /settings 页面，不再是占位路由），只是现在从 SettingsRow
 * 列表最后一行触发，不再是顶栏图标按钮触发。
 */
const SETTINGS_PATH = "/settings";

/**
 * Settings List 每一项共用的样式：显式高度 56px（h-14，落在规范给的
 * 56-60px 区间内）+ flex 垂直居中，而不是用上下 padding 去凑出目标高度——
 * 沿用阶段二 Header/搜索框已经验证过的"显式高度 + flex 居中"模式，比反推
 * padding 数值更能稳定命中目标高度，不受字号/行高变化影响。
 */
const settingsItemClassName =
  "mb-3 flex h-14 items-center justify-between rounded-2xl bg-white px-4 text-base font-medium text-text shadow-settings-item transition-opacity hover:opacity-90";

const chevronClassName = "text-[18px] leading-none text-chevron";

interface SettingsRowProps {
  to: string;
  icon: LucideIcon;
  label: string;
}

/**
 * 06 号卡新增：给功能列表每一行补上前置图标（codex_task_profile_redesign.md
 * "建议给全部 5 行都补上前置图标...用项目现有的线性图标集，不要用 emoji
 * 占位"），用 lucide-react。抽成这个小组件而不是每一行各自重复一遍
 * "图标+文字"的 JSX 结构，避免改一次行内布局要同步改好几处。
 *
 * "后台管理"那一行故意不用这个组件——codex_task_profile_redesign.md
 * 明确写了"「后台管理」分组标题及其列表卡片位置、样式保持不变"，不在这次
 * 补图标范围内，见下面渲染处的注释。
 */
function SettingsRow({ to, icon: Icon, label }: SettingsRowProps) {
  return (
    <Link to={to} className={settingsItemClassName}>
      <span className="flex items-center gap-3">
        <Icon aria-hidden="true" size={20} className="shrink-0 text-text-muted" />
        <span>{label}</span>
      </span>
      <span aria-hidden="true" className={chevronClassName}>
        ›
      </span>
    </Link>
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
 * 11 号卡（我的页面收尾）改版，依赖 06 号卡打下的基础结构：
 *
 * 11.1 顶栏精简：TopBar（06 号卡加的 tab 变体，标题"我的" + 设置齿轮）
 * 整个删掉，这个页面顶部不再有任何独立顶栏——AppShell 早就因为 06 号卡把
 * "/profile"加进了 TOPBAR_MIGRATED_PATTERNS（关掉全局 AppHeader），现在
 * 页面自己也不渲染 TopBar 了，两层都没有，跟 app-shell.tsx 的判断逻辑
 * 本身无关，不需要碰那个文件——内容区域直接从状态栏下方开始，顶部间距
 * 收窄成 14px（pt-3.5），不再是 TopBar 那个 56px 高的栏位。
 *
 * 视觉上没有可见的"我的"标题文字了，但页面仍然需要一个语义 <h1> landmark
 * （不能因为顶栏消失就变成整个页面没有主标题）——用 sr-only 隐藏视觉展示，
 * 只保留给屏幕阅读器，不违反"无可见标题文字"这条验收标准，也不留一个
 * 无障碍回归。
 *
 * 11.2 头像卡片跳转：头像本身（不是整张卡片）包一层 Link，点击跳转到
 * 当前登录用户自己的公开主页 `/users/:selfId`。ProfileSummary 新增的
 * `avatarHref` prop 就是为这个加的（见该文件顶部注释）——组件不关心跳去
 * 哪，只负责"提供了这个值就把头像包一层 Link"。user-profile-page.tsx
 * 早就有的 isOwnProfile 判断（currentUserId === userId 时隐藏发消息/
 * 屏蔽/举报入口）不需要为这次改动新写任何东西，直接生效。
 *
 * 11.3 功能列表：顺序改成 编辑资料/我的发布/我的活动/我的收藏/联系客服/
 * 设置——"设置"从顶栏齿轮移下来，加成最后一行，跟其余几行同一个
 * SettingsRow 组件/同一套样式，点击进入现成的 /settings 页面（不是占位
 * 路由）。"联系客服"这一行本身（文案/路由）是更早的任务卡改的，这次
 * 只动了它在列表里的位置（还是排在我的收藏后面，只是后面多了"设置"）。
 *
 * 13 号卡（"我的"页新增"已屏蔽"管理入口）：在"设置"上面插入"已屏蔽"这一
 * 行，跳转到新的 /blocked-users 列表页。位置故意不是插进"我的收藏"/"联系
 * 客服"这类业务功能行之间——"已屏蔽"跟隐私/账号管理更相关，归到列表靠后、
 * 紧挨着"设置"，这也是任务卡明确要求的位置，不是随手加在列表末尾。
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const email = session?.user.email ?? "";
  const currentUserId = session?.user.id;

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
              displayName={profile?.displayName ?? null}
              avatarUrl={profile?.avatarUrl ?? null}
              bio={profile?.bio}
              tertiaryText={email}
              avatarHref={currentUserId ? `/users/${currentUserId}` : undefined}
            />
          </div>
        ) : null}

        <nav aria-label="我的功能" className="mb-6">
          <SettingsRow to="/profile/edit" icon={Pencil} label="编辑资料" />
          <SettingsRow to="/my-posts" icon={FileText} label="我的发布" />
          <SettingsRow to="/my-activities" icon={Calendar} label="我的活动" />
          <SettingsRow to="/favorites" icon={Star} label="我的收藏" />
          <SettingsRow to="/feedback" icon={MessageSquare} label="联系客服" />
          <SettingsRow to="/blocked-users" icon={Ban} label="已屏蔽" />
          <SettingsRow to={SETTINGS_PATH} icon={Settings} label="设置" />
        </nav>

        {isAdmin === true ? (
          <section aria-label="管理员功能" className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-text-muted">后台管理</h2>
            {/* codex_task_profile_redesign.md："后台管理"分组标题及其列表
                卡片位置、样式保持不变——这一行故意不用 SettingsRow（不补
                前置图标），沿用改动前就有的纯文字行。 */}
            <Link to="/admin/posts" className={settingsItemClassName}>
              <span>后台管理</span>
              <span aria-hidden="true" className={chevronClassName}>
                ›
              </span>
            </Link>
          </section>
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
          className="w-full rounded-xl border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          退出登录
        </button>
      </div>
    </main>
  );
}
