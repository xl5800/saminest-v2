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
    <main>
      <h1>我的</h1>

      {isPending ? <p role="status">加载中…</p> : null}
      {isError ? <p role="alert">用户信息加载失败，请稍后重试。</p> : null}
      {!isPending && !isError ? <p>{profile?.displayName ?? "未知用户"}</p> : null}
      <p>{email}</p>

      <nav aria-label="我的功能">
        <Link to="/favorites">我的收藏</Link>
      </nav>

      {isAdmin === true ? (
        <section aria-label="管理员功能">
          <h2>后台管理</h2>
          <Link to="/admin/posts">后台管理</Link>
        </section>
      ) : null}

      {logoutError ? <p role="alert">{logoutError}</p> : null}
      <button type="button" onClick={handleLogout} disabled={isLoggingOut}>
        退出登录
      </button>
    </main>
  );
}
