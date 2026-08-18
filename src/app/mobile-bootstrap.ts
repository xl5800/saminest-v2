import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * 原生壳启动初始化：设置状态栏样式（不遮挡网页内容顶部）+ 网页资源加载
 * 完成后隐藏启动图。
 *
 * 这两个插件调用只在 Capacitor 原生环境（真机/模拟器里跑的原生 WebView）
 * 里才有意义——网页版（浏览器直接打开 https://www.saminest.com）跑到这里
 * 时 Capacitor 原生桥根本不存在，调用这两个插件会直接报错，所以最前面
 * 用 Capacitor.isNativePlatform() 判断，不是原生环境直接 return，不执行
 * 后面的插件调用。
 *
 * 不做成 React hook（不像 use-auth-bootstrap.ts）：这是一次性的原生壳
 * 初始化副作用，不需要跟任何组件的渲染生命周期或者 React state 绑定，
 * main.tsx 挂载 React 树之后调用一次就够，没必要为了这个套一层 hook。
 */
export async function initializeMobileShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // overlay: false——网页内容不从状态栏底下开始画，避免页面顶部（AppHeader
  // 等）被状态栏遮住一截。
  await StatusBar.setOverlaysWebView({ overlay: false });
  // 这个项目整体是浅色背景（--color-bg: #f3f5fa），状态栏文字/图标用深色
  // （Style.Light 在 Capacitor 的命名里是"给浅色背景配的深色文字"），
  // 跟页面视觉保持一致。
  await StatusBar.setStyle({ style: Style.Light });

  await SplashScreen.hide();
}
