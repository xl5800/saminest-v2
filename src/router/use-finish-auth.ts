import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";

import { resolveRedirectAfterLogin } from "../utils/auth-redirect";
import { hasInAppHistory } from "./use-go-back";

interface AuthLocationState {
  authDepth?: number;
}

/**
 * 登录/注册成功后怎么回到原来的页面，同时不把浏览历史弄乱。
 *
 * 第一版直接 `navigate(redirect, { replace: true })`：活动页 → 点报名进
 * 登录页（push）→ 登录成功用活动页替换掉登录页，历史里变成"活动页、活动页"
 * 两条；如果中间还去过注册页，就是"活动页、登录页、活动页"。用户在活动页
 * 点返回，要么还是同一个活动页，要么回到已经登录过的登录页，看起来像
 * "一直困在详情页出不去"。
 *
 * 现在记录"从原页面到这里经过了几个登录/注册页"（authDepth）：
 * - 从某个页面点"去登录"推进来的（PUSH），深度是 1；
 * - 登录页和注册页互相切换时，链接把深度 +1 带过去（authLinkState）；
 * - 成功后直接 navigate(-深度)，回到原页面那一条历史记录本身，登录/注册页
 *   从历史里退掉，返回键继续正常往前走。
 * 其它情况（被 RequireAuth 用 replace 送来、直接打开登录链接、刷新过页面）
 * 原页面不在身后，深度是 0，仍然按 ?redirect= 跳过去（replace）。
 */
export function useFinishAuth() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const stateDepth = (location.state as AuthLocationState | null)?.authDepth;
  const depth =
    typeof stateDepth === "number"
      ? stateDepth
      : navigationType === "PUSH" && hasInAppHistory()
        ? 1
        : 0;

  function finishAuth(): void {
    if (depth > 0) {
      navigate(-depth);
      return;
    }
    navigate(resolveRedirectAfterLogin(searchParams), { replace: true });
  }

  return { finishAuth, authLinkState: { authDepth: depth + 1 } satisfies AuthLocationState };
}
