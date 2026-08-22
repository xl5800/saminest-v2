import { Calendar, FileText, MessageSquare, Pencil, Settings, Star, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ProfileSummary } from "../../components/profile-summary";
import { TopBar } from "../../components/top-bar";
import { useIsAdminQuery } from "../../features/admin/use-is-admin-query";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { authService } from "../../services/auth/auth-service";
import { useAuthStore } from "../../store/auth-store";

const LOGOUT_ERROR_MESSAGE = "退出登录失败，请稍后重试。";

/**
 * 顶部栏"设置"齿轮的目标路径——06 号卡（00-overview.md 顶部栏规则表）
 * 当初只要求"我的"页顶部右侧有一个设置齿轮，这里先接入的是一个占位路径。
 * 账号注销功能（settings-page.tsx / delete-account-page.tsx）落地后，
 * routes.tsx 里已经补上 /settings 和 /settings/delete-account 这两条
 * 路由，这个常量本身不用改，"占位"的部分已经不再成立。
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
 * 占位"），用 lucide-react（项目已经在 bottom-nav.tsx 里引入过，这里复用
 * 同一个图标库，不新增依赖）。抽成这个小组件而不是 5 行各自重复一遍
 * "图标+文字"的 JSX 结构，避免改一次行内布局要同步改 5 处。
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
 * hook），不重新实现一遍角色判断逻辑——06 号卡"后台管理只有管理员能看到"
 * 这条验收标准在这次改动之前就已经是这个写法（isAdmin === true 才渲染
 * 整块，不是置灰），这次没有改这段判断逻辑本身，只是把它保留在新的页面
 * 结构里。
 *
 * 06 号卡（profile-region-misc）改版：
 * - 顶部栏换成 TopBar 的 tab 变体（标题"我的"，右侧设置齿轮），不再是
 *   全局 AppHeader 那一套"← Saminest 发布"；组件自己的 <h1> 已经是这个
 *   页面的标题，原来手写的 <h1>我的</h1> 删掉，避免同一个页面出现两个
 *   <h1>（见 top-bar.tsx 顶部注释）。这个路由已经加进
 *   app-shell.tsx 的 TOPBAR_MIGRATED_PATTERNS。
 * - 头像区改用 ProfileSummary 的 compact 变体（56px 头像、左对齐横排
 *   卡片），恢复 codex_task_profile_redesign.md 的验收标准——这是对
 *   36732ee（个人主页视觉统一）把"我的"页头像区改成跟公开主页共用的
 *   96px 居中样式的一次有意调整，不是不知道这个改动的存在；调整方式是
 *   给共享组件加 size 变体，不是把两个页面拆开各写各的，见
 *   profile-summary.tsx 顶部注释。
 * - "编辑资料"从卡片下方的独立蓝色按钮，改成功能列表的第一行，样式跟
 *   "我的发布/我的活动/我的收藏/联系客服"（原"意见反馈"，本次任务改名，
 *   路由还是 /feedback）完全一致（同一个
 *   settingsItemClassName）。邮箱从紧跟按钮下面的一行文字，改成
 *   compact 卡片内的第三行（ProfileSummary 的 tertiaryText），组件本身
 *   仍然不认识"邮箱"这个概念，只是换了个位置摆放同一段文字。
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const email = session?.user.email ?? "";

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
      <TopBar
        variant="tab"
        title="我的"
        right={{
          icon: <Settings size={18} aria-hidden="true" />,
          label: "设置",
          onClick: () => navigate(SETTINGS_PATH)
        }}
      />

      {/* TopBar 本身不套 max-w（跟 categories-page.tsx/activity-list-page.tsx/
          user-profile-page.tsx 同一个约定，全宽横跨视口），页面内容单独套
          max-w-md——公开主页 user-profile-page.tsx 也是 max-w-md，两个页面
          宽度保持一致。 */}
      <div className="mx-auto max-w-md px-4 py-6">
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
              bio={profile?.bio}
              tertiaryText={email}
            />
          </div>
        ) : null}

        <nav aria-label="我的功能" className="mb-6">
          <SettingsRow to="/profile/edit" icon={Pencil} label="编辑资料" />
          <SettingsRow to="/my-posts" icon={FileText} label="我的发布" />
          <SettingsRow to="/my-activities" icon={Calendar} label="我的活动" />
          <SettingsRow to="/favorites" icon={Star} label="我的收藏" />
          <SettingsRow to="/feedback" icon={MessageSquare} label="联系客服" />
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
