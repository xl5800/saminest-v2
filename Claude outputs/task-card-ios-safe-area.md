# 任务卡：iOS 沉浸式状态栏 + 安全区适配

## 对应 worktree
路径：`../saminest-v2-ios-safe-area`
分支：`feat/ios-safe-area`（从最新 `main` 拉出）

## 背景
BARRY 反馈：真机上滑动到顶部边界时没有回弹效果、停得很僵硬，而且顶部有一块黑边。

已经确认根因：`src/app/mobile-bootstrap.ts` 里 `StatusBar.setOverlaysWebView({ overlay: false })` 让网页内容不从状态栏底下开始画，同时全项目没有任何 `env(safe-area-inset-*)` 相关的 CSS（已用 Grep 确认 `index.css`/`app-shell.tsx` 都没有 `safe-area` 字样）。这个组合会导致 WKWebView 用特殊的 `contentInset` 计算方式来"让出"状态栏区域，这既会产生视觉上的黑边（状态栏那块没有内容可画，露出原生层默认的黑色），也会让顶部的橡皮筋回弹表现变僵硬。

标准修法是反过来：改成 `overlay: true`（网页内容延伸到状态栏底下），然后给最外层内容加 `padding-top: env(safe-area-inset-top)` 把内容视觉上推到状态栏下面——这样状态栏那块区域露出来的是网页自己的背景色，WKWebView 也不用再算那个特殊的 contentInset，两个问题通常会一起解决。

`index.html` 的 viewport 已经带了 `viewport-fit=cover`（`<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`），做这个改动不需要再加这个 meta 标签。

## 具体改法

### 1. `src/app/mobile-bootstrap.ts`
把：
```ts
  // overlay: false——网页内容不从状态栏底下开始画，避免页面顶部（AppHeader
  // 等）被状态栏遮住一截。
  await StatusBar.setOverlaysWebView({ overlay: false });
```
改成：
```ts
  // overlay: true——网页内容延伸到状态栏底下（沉浸式），配合下面
  // index.css 里 body 的 padding-top: env(safe-area-inset-top) 把内容
  // 视觉上推开。改成这样是为了修复一个真机上的组合问题：overlay:false
  // 会让 WKWebView 用特殊的 contentInset 计算方式让出状态栏区域，这既会
  // 露出状态栏那块的黑色空白（网页没有内容可画在那里），也会让顶部滑动
  // 到边界时的橡皮筋回弹变僵硬——见任务卡背景说明。
  await StatusBar.setOverlaysWebView({ overlay: true });
```
`StatusBar.setStyle({ style: Style.Light })` 这一行不用动，跟 overlay 是否为 true/false 无关（决定的是状态栏文字/图标颜色，不是内容是否延伸到状态栏底下）。

### 2. `src/index.css`
找到现有的 `body` 规则（第 256-259 行）：
```css
body {
  background-color: var(--color-bg);
  color: var(--color-text);
}
```
改成：
```css
body {
  background-color: var(--color-bg);
  color: var(--color-text);
  /* iOS 沉浸式状态栏 + 安全区适配任务卡：配合 mobile-bootstrap.ts 的
     overlay:true，把整个页面内容往下推开状态栏（含刘海）高度。env() 在
     没有安全区的环境（桌面浏览器、大多数 Android、没有刘海的 iOS 设备）
     下解析成 0，不影响非目标场景；index.html 的 viewport 已经带了
     viewport-fit=cover，这里不用再加。状态栏那块区域露出来的是这行
     background-color（--color-bg），不再是原生层的黑色。 */
  padding-top: env(safe-area-inset-top);
}
```

## 明确不做的事
- 不碰底部安全区（`env(safe-area-inset-bottom)`）——BARRY 这次反馈的是顶部黑边+顶部回弹僵硬，底部导航栏没有被提到有问题，这次不扩大范围。
- 不改 `capacitor.config.ts`、`index.html`（`viewport-fit=cover` 已经有了）。
- 不改任何页面自己的 TopBar/AppHeader/悬浮按钮组件——这次是全局 body 级别的一次性修复，不需要逐页面调整。
- 不处理 Android——这个问题是 iOS WKWebView 特有的组合（`overlay:false` 缺 safe-area CSS），`env()` 在 Android 上按 W3C 标准解析（通常是 0，除非设备本身声明了安全区），这次改动本身对 Android 无副作用，但也不专门针对 Android 做验证。

## 验证要求
- `npm run typecheck && npm run test && npm run build` 三条都要跑，贴完整输出。
- 因为这是纯 iOS 原生壳的视觉问题，网页测试环境测不出来，麻烦用真机或者 Xcode 模拟器实际跑一遍原生 App（`npx cap sync ios` 之后跑），确认：状态栏区域不再是黑色（露出的是 App 背景色）、往上滑动到顶部边界时有正常的橡皮筋回弹效果。
- 顺手确认一下页面内容没有因为多了这段 padding-top 而整体往下多出一截"双重留白"——尤其是那些自己也有顶部间距的页面（比如各种 TopBar/AppHeader），如果发现明显重复的留白，在完工报告里说清楚，不用自己动手改（这次任务卡范围只到 body 级别的这一次改动）。
