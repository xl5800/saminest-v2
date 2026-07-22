import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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

  // 目前 v2 没有头像上传功能，avatar_url 实际上总是 null——没有头像时退化
  // 成"昵称首字母"占位圆形，而不是留空，理由同下面头像 <img>/占位分支。
  const avatarInitial = profile?.displayName?.trim().charAt(0).toUpperCase() || "?";

  return (
    <main className="bg-profile-page mx-auto min-h-screen max-w-md px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">我的</h1>

      {isPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}
      {isError ? (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          用户信息加载失败，请稍后重试。
        </p>
      ) : null}

      <div className="mb-6 flex h-23 items-center gap-4 rounded-profile-card border border-border bg-white px-4 shadow-card">
        {!isPending && !isError ? (
          profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg text-lg font-semibold text-text-muted"
            >
              {avatarInitial}
            </div>
          )
        ) : (
          <div aria-hidden="true" className="h-14 w-14 shrink-0 rounded-full bg-bg" />
        )}
        <div className="min-w-0">
          {!isPending && !isError ? (
            <p className="break-words text-lg font-medium text-text">{profile?.displayName ?? "未知用户"}</p>
          ) : null}
          <p className="break-words text-sm text-text-muted">{email}</p>
        </div>
      </div>

      <nav aria-label="我的功能" className="mb-6">
        <Link to="/my-posts" className={settingsItemClassName}>
          <span>我的发布</span>
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
