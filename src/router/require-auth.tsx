import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { useAuthStore } from "../store/auth-store";
import { useLoginPath } from "./use-login-path";

export function RequireAuth({
  children
}: {
  children: ReactElement;
}): ReactElement {
  const session = useAuthStore((s) => s.session);
  // 注册登录简化任务卡：跳登录页时带上当前页，登录成功后回到这里。
  const loginPath = useLoginPath();
  if (!session) return <Navigate to={loginPath} replace />;
  return children;
}
