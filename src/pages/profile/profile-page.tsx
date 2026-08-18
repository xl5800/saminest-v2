import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ProfileSummary } from "../../components/profile-summary";
import { useIsAdminQuery } from "../../features/admin/use-is-admin-query";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { authService } from "../../services/auth/auth-service";
import { useAuthStore } from "../../store/auth-store";

const LOGOUT_ERROR_MESSAGE = "退出登录失败，请稍后重试。";

/**
 * Settings List 每一项共用的样式：显式高度 56px（h-14，落在规范给的
 * 56-60px 区间内）+ flex 垂直居中，而不是用上下 padding 去凑出目标高度——
 * 沿用阶段二 Header/搜索框已经验证过的"显式高度 + flex 居中"模式，比反推
 * padding 数值更能稳定命中目标高度，不受字号/行高变化影响。
 */
const settingsItemClassName =
  "mb-3 flex h-14 items-center justify-between rounded-2xl bg-white px-4 text-base font-medium text-text shadow-settings-item transition-opacity hover:opacity-90";

const chevronClassName = "text-[18px] leading-none text-[#999]";

/**
 * "我的"标签页目标页面（/profile，路由已在 routes.tsx 用 RequireAuth
 * 包裹，这里不做登录检查/跳转，符合 CLAUDE.md 的统一规则）。
 *
 * 是否管理员复用现有的 useIsAdminQuery（RequireAdmin 也在用同一个
 * hook），不重新实现一遍角色判断逻辑。
 *
 * 头部视觉统一：原来是 56px 头像 + 昵称 + 内联"编辑"文字链接 + 邮箱的小
 * 横条卡片，跟公开主页（user-profile-page.tsx）96px 大头像居中 + 昵称 +
 * 城市 + 简介的展示完全是两套视觉语言——用户自己看不到"我在别人眼里主页
 * 长什么样"，也看不到自己填的城市/简介有没有生效（这里之前压根没展示
 * 这两个字段）。现在改成用共享组件 ProfileSummary 渲染头像/昵称/城市/
 * 简介，两个页面头部手感一致；数据来自现有的 useMyProfileQuery()，
 * MyProfile 早就带了 bio/locationName，不需要新查询。
 *
 * 邮箱是这个页面独有的展示项（公开主页从来不展示邮箱——这是隐私信息，
 * ProfileSummary 不应该知道"邮箱"这个概念），跟"编辑资料"按钮一起作为
 * children 传给 ProfileSummary，渲染在头像/昵称/城市/简介下面同一个
 * 操作区里，不塞进共享组件的 props。原来内联的"编辑"文字链接去掉，统一
 * 换成这个按钮，视觉重量参考 user-profile-page.tsx 的"发消息"按钮，两个
 * 页面手感一致。
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
    <main className="mx-auto min-h-screen max-w-md px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">我的</h1>

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
            locationName={profile?.locationName}
            bio={profile?.bio}
          >
            <Link
              to="/profile/edit"
              className="mt-4 rounded bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              编辑资料
            </Link>
            <p className="mt-2 break-words text-sm text-text-muted">{email}</p>
          </ProfileSummary>
        </div>
      ) : null}

      <nav aria-label="我的功能" className="mb-6">
        <Link to="/my-posts" className={settingsItemClassName}>
          <span>我的发布</span>
          <span aria-hidden="true" className={chevronClassName}>
            ›
          </span>
        </Link>
        <Link to="/my-activities" className={settingsItemClassName}>
          <span>我的活动</span>
          <span aria-hidden="true" className={chevronClassName}>
            ›
          </span>
        </Link>
        <Link to="/favorites" className={settingsItemClassName}>
          <span>我的收藏</span>
          <span aria-hidden="true" className={chevronClassName}>
            ›
          </span>
        </Link>
        <Link to="/feedback" className={settingsItemClassName}>
          <span>意见反馈</span>
          <span aria-hidden="true" className={chevronClassName}>
            ›
          </span>
        </Link>
      </nav>

      {isAdmin === true ? (
        <section aria-label="管理员功能" className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-text-muted">后台管理</h2>
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
    </main>
  );
}
