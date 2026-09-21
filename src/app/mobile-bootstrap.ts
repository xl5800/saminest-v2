import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * 原生壳启动初始化：设置状态栏样式（沉浸式，网页内容延伸到状态栏底下，
 * 具体视觉上的"让内容不被状态栏挡住"改由 index.css 的
 * padding-top: env(safe-area-inset-top) 负责，见下面 overlay 那行的
 * 注释）+ 系统键盘收起时强制重排（见下面 Keyboard.addListener 那段的
 * 注释）+ 网页资源加载完成后隐藏启动图。
 *
 * iOS 沉浸式状态栏 + 安全区适配任务卡：这里原来是 overlay: false（网页
 * 内容不从状态栏底下开始画），真机上会导致状态栏区域露出原生层的黑色
 * 空白、且顶部下拉回弹变僵硬——改成 overlay: true + CSS 安全区内边距是
 * 标准修法，见下面 overlay 那行和 index.css body 规则的注释。
 *
 * 这几个插件调用只在 Capacitor 原生环境（真机/模拟器里跑的原生 WebView）
 * 里才有意义——网页版（浏览器直接打开 https://www.saminest.com）跑到这里
 * 时 Capacitor 原生桥根本不存在，调用这些插件会直接报错，所以最前面
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

  // overlay: true——网页内容延伸到状态栏底下（沉浸式），配合下面
  // index.css 里 body 的 padding-top: env(safe-area-inset-top) 把内容
  // 视觉上推开。改成这样是为了修复一个真机上的组合问题：overlay:false
  // 会让 WKWebView 用特殊的 contentInset 计算方式让出状态栏区域，这既会
  // 露出状态栏那块的黑色空白（网页没有内容可画在那里），也会让顶部滑动
  // 到边界时的橡皮筋回弹变僵硬——见任务卡背景说明。
  await StatusBar.setOverlaysWebView({ overlay: true });
  // 这个项目整体是浅色背景（--color-bg: #f3f5fa），状态栏文字/图标用深色
  // （Style.Light 在 Capacitor 的命名里是"给浅色背景配的深色文字"），
  // 跟页面视觉保持一致。
  await StatusBar.setStyle({ style: Style.Light });

  // 消息输入框卡在屏幕中间任务卡：iOS WKWebView 一个很典型的坑——系统
  // 键盘收起时，WKWebView 对可视区域（visual viewport）resize 的处理不够
  // 干净，sticky bottom-0 元素（比如 conversation-page.tsx 的消息输入框、
  // support-conversation-page.tsx 的客服聊天输入框——这两处目前项目里仅有
  // 的 sticky bottom-0 用法，装在这里两处一起受益，不需要逐页面打补丁）
  // 不会自动重新贴回真正的屏幕底部，会"卡"在键盘刚才顶上去的那个位置。
  //
  // 监听 keyboardDidHide（不是 keyboardWillHide）：两者在 Android 上几乎
  // 同时触发，但语义上 Did 表示键盘收起动画已经真正完成、可视区域尺寸已经
  // 稳定下来；如果用 Will（键盘刚开始收起、动画还没走完）就强制
  // window.scrollTo(0, 0)，等于在一次还没结束的 resize 动画中间插一脚，
  // 容易和收起动画本身打架，起不到"稳定 snap 回正确位置"的效果，所以选
  // Did 这个时机更可靠。scrollTo(0, 0) 是 Capacitor/Ionic 官方文档给这个
  // 问题的标准修法：强制触发一次浏览器重新计算布局，sticky 元素会重新根据
  // 当前（键盘已收起的）视口结算 bottom: 0 的位置。
  //
  // 挂在这里（App 启动时的全局初始化），不是某个页面组件里：这样修复对
  // 项目里所有用 sticky bottom-0 的输入框都生效，不用每个页面各写一次；
  // 跟 StatusBar/SplashScreen 一样，生命周期跟应用本身一样长，不需要在
  // 组件卸载时清理这个监听器。
  await Keyboard.addListener("keyboardDidHide", () => {
    window.scrollTo(0, 0);
  });

  await SplashScreen.hide();
}
