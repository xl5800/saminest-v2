import { Capacitor, CapacitorHttp } from "@capacitor/core";

/**
 * App 新版本检查（"发布了新版本但手机上没提示更新"任务卡）。
 *
 * 背景：iOS 系统本身不会弹窗提示"有新版本"，只能靠 App 自己检查。
 * 这个项目的 capacitor.config.ts 没有配 server.url，iOS App 加载的是
 * 打包进去的 dist/，所以网页端（Vercel）上线的改动，老版本 App 用户
 * 看不到，必须引导他们去 App Store 更新。
 *
 * 做法：启动时查苹果公开的 iTunes Lookup 接口拿 App Store 上的最新版本号，
 * 跟当前 App 的版本号比较，更高就弹提示（components/app-update-sheet.tsx）。
 *
 * - 当前版本号：构建期从 VITE_APP_VERSION 读（codemagic.yaml 里用触发构建的
 *   git tag 去掉 v 前缀设置，跟 MARKETING_VERSION 同一个来源，保证一致）。
 *   本地 / 网页构建没有这个变量，直接不检查。没有用 @capacitor/app 的
 *   App.getInfo()：那要新加一个原生插件依赖（npm install + cap sync +
 *   重新生成 lock 文件），而构建期注入已经能拿到同一个值。
 * - 请求用 CapacitorHttp（原生层发请求）而不是 fetch：itunes.apple.com 不
 *   返回 CORS 头，WKWebView 里直接 fetch 会被拦。
 * - 只在 iOS 原生壳里检查；网页版永远是最新的，安卓目前不走 App Store。
 * - 用户点"以后再说"后记住这个版本号，同一个版本不再打扰，更新的版本再提示。
 * - 苹果 CDN 同步有延迟，刚发版几小时内查到的可能还是旧版本，属正常。
 */

const BUNDLE_ID = "com.saminest.app";
const LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=us`;
const DISMISSED_VERSION_KEY = "saminest.app-update.dismissed-version";

export interface AppUpdateInfo {
  latestVersion: string;
  storeUrl: string;
  releaseNotes: string | null;
}

/**
 * 比较 "1.2.10" 这种点分版本号：a > b 返回正数，相等 0，a < b 负数。
 * 位数不同时缺的位按 0 算（1.2 == 1.2.0）。
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function getCurrentAppVersion(): string | null {
  const version = import.meta.env.VITE_APP_VERSION;
  return version ? version.trim() : null;
}

/** https://apps.apple.com/... 换成 itms-apps://，直接打开 App Store App，不经过 Safari。 */
export function toAppStoreAppUrl(url: string): string {
  return url.replace(/^https?:\/\//, "itms-apps://");
}

export function getDismissedVersion(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_VERSION_KEY);
  } catch {
    return null;
  }
}

export function dismissAppUpdate(version: string): void {
  try {
    window.localStorage.setItem(DISMISSED_VERSION_KEY, version);
  } catch {
    // 存不了就下次启动再提示，不影响使用。
  }
}

interface LookupResponse {
  resultCount?: number;
  results?: Array<{ version?: string; trackViewUrl?: string; releaseNotes?: string }>;
}

/**
 * 有可用的新版本（且用户没对这个版本点过"以后再说"）时返回更新信息，
 * 其他所有情况（非 iOS、没有版本号、网络失败、App Store 查不到）都返回 null，
 * 检查失败不能影响 App 正常使用。
 */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return null;

  const currentVersion = getCurrentAppVersion();
  if (!currentVersion) return null;

  try {
    const response = await CapacitorHttp.get({
      url: LOOKUP_URL,
      // 苹果这个接口返回的 Content-Type 是 text/javascript，原生层可能按
      // 字符串返回，下面两种都兼容。
      headers: { Accept: "application/json" }
    });
    if (response.status !== 200) return null;

    const body: LookupResponse =
      typeof response.data === "string" ? JSON.parse(response.data) : response.data;
    const result = body.results?.[0];
    if (!result?.version || !result.trackViewUrl) return null;

    if (compareVersions(result.version, currentVersion) <= 0) return null;

    const dismissed = getDismissedVersion();
    if (dismissed && compareVersions(result.version, dismissed) <= 0) return null;

    return {
      latestVersion: result.version,
      storeUrl: result.trackViewUrl,
      releaseNotes: result.releaseNotes?.trim() || null
    };
  } catch {
    return null;
  }
}
