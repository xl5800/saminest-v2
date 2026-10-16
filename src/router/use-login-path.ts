import { useLocation } from "react-router-dom";

import { buildLoginPath } from "../utils/auth-redirect";

/**
 * 当前页面对应的"去登录"地址：`/login?redirect=<当前路径>`，登录成功后
 * 回到当前页（注册登录简化任务卡，见 utils/auth-redirect.ts）。所有
 * "未登录 → 去登录"的入口都用这个，不再直接写 "/login"。
 */
export function useLoginPath(): string {
  const location = useLocation();
  return buildLoginPath(`${location.pathname}${location.search}`);
}
