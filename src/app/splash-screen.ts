import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * 启动图（原生壳的 Splash Screen）收起时机。
 *
 * 原来 mobile-bootstrap.ts 在 React 刚挂载、状态栏设置完就立刻
 * SplashScreen.hide()，加上插件默认约 500ms 自动收起，启动图一闪而过，
 * 用户接着看到的是首页的"加载中"骨架屏。现在改成：
 * - capacitor.config.ts 里 launchAutoHide: false，插件不再自动收起；
 * - 打开的是首页（`/`）：等首页第一屏帖子请求结束（成功或失败都算）再收起，
 *   由 home-page.tsx 调用 hideSplashScreen()。登录状态恢复在这之前已经完成
 *   ——App.tsx 在 isInitializing 为 true 时根本不渲染路由，首页能挂载就说明
 *   登录状态已经恢复；
 * - 打开的不是首页（比如从分享链接直接进帖子详情）：登录状态恢复完成就收起，
 *   由 App.tsx 调用，不等那个页面自己的数据；
 * - 兜底：从启动开始最多等 SPLASH_MAX_WAIT_MS，网络很慢、请求卡住或者上面
 *   哪条路径没走到时也会收起，不让用户卡在启动图上。
 *
 * hideSplashScreen() 可以被多处、多次调用，只有第一次真正调插件；网页版
 * （浏览器直接打开 www.saminest.com）没有原生启动图，直接什么都不做。
 */
export const SPLASH_MAX_WAIT_MS = 3000;

let hidden = false;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

export function hideSplashScreen(): void {
  if (hidden) return;
  hidden = true;
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (!Capacitor.isNativePlatform()) return;
  void SplashScreen.hide().catch((error: unknown) => {
    // 收起失败不是用户能处理的事，只留日志；插件本身出错时启动图也不会
    // 因为这里重试而恢复正常。
    console.error("收起启动图失败：", error);
  });
}

/** 启动时调用一次（mobile-bootstrap.ts），开始兜底计时。 */
export function startSplashScreenFallback(): void {
  if (hidden || fallbackTimer !== null) return;
  fallbackTimer = setTimeout(hideSplashScreen, SPLASH_MAX_WAIT_MS);
}

/** 只给单测用：重置模块内部状态。 */
export function resetSplashScreenStateForTests(): void {
  hidden = false;
  if (fallbackTimer !== null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}
