import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useIsAdminQuery } from "../../features/admin/use-is-admin-query";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { authService } from "../../services/auth/auth-service";
import { useAuthStore } from "../../store/auth-store";

const LOGOUT_ERROR_MESSAGE = "退出登录失败，请稍后重试。";

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

  return (
    <main className="mx-auto max-w-md px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">我的</h1>

      {isPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}
      {isError ? (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          用户信息加载失败，请稍后重试。
        </p>
      ) : null}
      <div className="mb-4 rounded-lg border border-border bg-white p-4">
        {!isPending && !isError ? (
          <p className="font-medium text-text">{profile?.displayName ?? "未知用户"}</p>
        ) : null}
        <p className="text-sm text-text-muted">{email}</p>
      </div>

      <nav aria-label="我的功能">
        <Link
          to="/favorites"
          className="mb-2 block rounded-lg border border-border bg-white p-4 text-sm text-text hover:border-primary"
        >
          我的收藏
        </Link>
      </nav>

      {isAdmin === true ? (
        <section aria-label="管理员功能" className="mb-4">
          <h2 className="mb-2 text-sm font-medium text-text-muted">后台管理</h2>
          <Link
            to="/admin/posts"
            className="mb-2 block rounded-lg border border-border bg-white p-4 text-sm text-text hover:border-primary"
          >
            后台管理
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
        className="w-full rounded border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        退出登录
      </button>
    </main>
  );
}
