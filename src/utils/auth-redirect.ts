/**
 * 登录后回到原页面（注册登录简化任务卡）。
 *
 * 原来所有"去登录"的入口（RequireAuth、收藏、联系卖家、报名、评论……）都只
 * 跳 `/login`，登录页/注册页成功后又写死 `navigate("/")`——用户从微信群
 * 点开一个找搭子活动，点报名去登录，登录完却落在首页，活动就找不到了。
 *
 * 现在去登录时带上来源页：`/login?redirect=/activities/xxx`，登录页切到
 * 注册页时把这个参数一起带过去，成功后跳回 redirect 指向的页面。
 *
 * 安全：redirect 只接受站内路径——必须以单个 "/" 开头，不能是 "//"（浏览器
 * 会把 "//evil.com" 当成协议相对的外部地址）也不能带反斜杠（部分浏览器把
 * "/\evil.com" 归一化成 "//evil.com"），否则一律当成没传，回首页。防止有
 * 人构造 `saminest.com/login?redirect=https://钓鱼网站` 这种链接，借我们的
 * 域名把刚登录的用户带去别的网站。
 */
export const REDIRECT_PARAM = "redirect";

const DEFAULT_AFTER_LOGIN_PATH = "/";

/** 这些页面本身就是登录流程的一部分，登录成功后回到它们没有意义。 */
const AUTH_FLOW_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

export function sanitizeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  const pathname = raw.split(/[?#]/)[0];
  if (AUTH_FLOW_PATHS.includes(pathname)) return null;
  return raw;
}

/** 登录/注册成功后要去的地方。 */
export function resolveRedirectAfterLogin(searchParams: URLSearchParams): string {
  return sanitizeRedirectPath(searchParams.get(REDIRECT_PARAM)) ?? DEFAULT_AFTER_LOGIN_PATH;
}

/**
 * 拼一个带 redirect 参数的登录/注册页地址。from 一般传
 * `location.pathname + location.search`；from 本身不合法（比如就在登录页）
 * 时返回不带参数的地址。
 */
export function buildAuthPath(target: "/login" | "/register", from: string | null | undefined): string {
  const safe = sanitizeRedirectPath(from);
  // 来源就是首页时不带参数：登录后默认本来就回首页，地址干净一点。
  if (!safe || safe === DEFAULT_AFTER_LOGIN_PATH) return target;
  return `${target}?${REDIRECT_PARAM}=${encodeURIComponent(safe)}`;
}

export function buildLoginPath(from: string | null | undefined): string {
  return buildAuthPath("/login", from);
}

/** 在登录页/注册页之间切换时，把当前的 redirect 参数原样带过去。 */
export function carryRedirect(target: "/login" | "/register", searchParams: URLSearchParams): string {
  return buildAuthPath(target, searchParams.get(REDIRECT_PARAM));
}
