---
name: Saminest
description: DMV 地区（华盛顿 DC / 弗吉尼亚 / 马里兰）华人社区同城生活服务 App —— 租房、求租、二手、找搭子。
colors:
  primary: "#3457e8"
  primary-hover: "#2743b8"
  primary-dark: "#2743b8"
  primary-light: "#eef1fd"
  primary-soft: "#c9d5fb"
  accent: "#3457e8"
  bg: "#f3f5fa"
  card: "#ffffff"
  text: "#1c1c1e"
  text-muted: "#8a8a8e"
  text-subtle: "#b0b0b5"
  border: "#ececef"
  chevron: "#c7c7cc"
  success: "#2e7d32"
  warning: "#b7791f"
  danger: "#c0392b"
typography:
  title-lg:
    fontFamily: "{typography.fontStack}"
    fontSize: 20px
    fontWeight: "600"
    lineHeight: 28px
  title-sm:
    fontFamily: "{typography.fontStack}"
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 28px
  subtitle:
    fontFamily: "{typography.fontStack}"
    fontSize: 16px
    fontWeight: "500"
    lineHeight: 24px
  body:
    fontFamily: "{typography.fontStack}"
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  caption:
    fontFamily: "{typography.fontStack}"
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  tag:
    fontFamily: "{typography.fontStack}"
    fontSize: 12px
    fontWeight: "500"
    lineHeight: 16px
  fontStack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"
rounded:
  avatar-tile: 6px
  list-box: 8px
  control: 12px
  card: 16px
  profile-card: 20px
  search: 26px
  full: 9999px
spacing:
  base: 8px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    typography: "{typography.subtitle}"
    rounded: "{rounded.control}"
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-disabled:
    opacity: 0.6
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: 44px
    border: "1px solid {colors.border}"
  fab:
    backgroundColor: "{colors.primary}"
    height: 48px
    rounded: "{rounded.full}"
    shadow: "0 6px 16px rgba(52, 87, 232, 0.35)"
  fab-dark-variant:
    backgroundColor: "{colors.primary-dark}"
  icon-button:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.full}"
    height: 36px
    width: 36px
  input-search:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.search}"
    height: 52px
    border: "1px solid {colors.border}"
    shadow: "0 1px 4px rgba(0, 0, 0, 0.06)"
  input-form:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.control}"
    height: 44px
    border: "1px solid {colors.border}"
    typography: "{typography.body}"
  card-content:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    shadow: "0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)"
  card-profile-compact:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.profile-card}"
    padding: "{spacing.md}"
  list-row:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    height: 56px
    shadow: "0 2px 12px rgba(0, 0, 0, 0.05)"
  avatar-tile-square:
    rounded: "{rounded.avatar-tile}"
  tag-chip:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    typography: "{typography.tag}"
    rounded: "{rounded.list-box}"
motion:
  gesture-snap-back:
    property: transform
    duration: 200ms
    easing: ease-out
  hover-fade:
    property: opacity
    duration: 150ms
    easing: "cubic-bezier(0.4, 0, 0.2, 1)"
---

## Design Tokens

> 以下所有数值均从当前代码库实际读出（`src/index.css` 的 `@theme` 块、以及各组件文件里实际使用的 Tailwind 工具类），不是设计推导值。项目用 Tailwind CSS v4（CSS-first 配置，没有 `tailwind.config.js`），token 定义在 `src/index.css` 顶部的 `@theme { ... }` 块里，命名是 `--color-*` / `--radius-*` / `--shadow-*` 这一套，不是 `--app-*` 前缀——文件末尾的"备注"部分说明了这个命名差异。

### 颜色

| Token（代码里的实际变量名） | Hex | 用途 |
|---|---|---|
| `--color-primary` | `#3457E8` | 品牌主色/强调蓝——按钮、链接、选中态、分类高亮，全站唯一的强调色相 |
| `--color-primary-hover` | `#2743B8` | Primary 按钮的 hover 反馈色 |
| `--color-primary-dark` | `#2743B8` | 数值与 hover 相同，但语义独立——用于"找搭子"页悬浮按钮等需要跟默认场景区分的地方 |
| `--color-primary-light` | `#EEF1FD` | 浅蓝底，分类标签 / 高亮态背景 |
| `--color-primary-soft` | `#C9D5FB` | 更浅一级的蓝，空状态占位色 |
| `--color-accent` | `#3457E8` | 历史遗留的独立 token（曾经是不同的蓝），现已收敛成跟 primary 完全相同的值；分类选中态、发布按钮、底部导航中间按钮仍在用这个类名，只改值未改名 |
| `--color-bg` | `#F3F5FA` | 全站页面画布背景（唯一的页面级背景色） |
| `--color-card` | `#FFFFFF` | 卡片 / 圆形图标按钮等"白色元素"背景 |
| `--color-text` | `#1C1C1E` | 主文字 |
| `--color-text-muted` | `#8A8A8E` | 次要文字（说明文字、未读态之外的默认状态） |
| `--color-text-subtle` | `#B0B0B5` | 三级文字（邮箱、极小标签这类最弱化的文字） |
| `--color-border` | `#ECECEF` | 分隔线 / 输入框边框 |
| `--color-chevron` | `#C7C7CC` | 弱化图标 / chevron 箭头专用色，比 text-muted 更淡 |
| `--color-success` | `#2E7D32` | 成功态 |
| `--color-warning` | `#B7791F` | 警告态 |
| `--color-danger` | `#C0392B` | 危险 / 错误态（含"退出"、"删除"等破坏性操作文字色） |

全站**只有一套蓝色层级**（primary 及其深/浅变体），没有第二种强调色相（不用橙色、珊瑚色等）。

### 字体

**项目没有加载任何自定义字体或 `@font-face`**——`index.html` 里没有 Google Fonts / 字体 CDN 链接，`package.json` 里也没有字体相关依赖。全站字体来自 **Tailwind 默认的 `font-sans` 系统字体栈**（由 Tailwind Preflight 应用到 `<html>`，代码里没有显式覆写）：

```
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
"Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji",
"Segoe UI Symbol", "Noto Color Emoji"
```

"Noto Sans" 只是这个栈里排在 `Helvetica Neue` 之后的众多系统 UI 字体回退名之一，**不是项目主动选择加载的独立字体**——中文字符的实际渲染效果取决于用户系统预装的中文字体（macOS 上是 PingFang SC，Windows 上是 Microsoft YaHei，Android 上通常是 Noto Sans CJK）。`index.html` 里 `<html lang="zh-CN">` 已经设置好语言标签。

字号层级（Tailwind 默认字号刻度，`src/index.css` 里有一套语义约定，未新建自定义字号 token）：

| 层级 | Tailwind 类 | 字号 / 行高 | 字重 | 用途 |
|---|---|---|---|---|
| Title | `text-lg` / `text-xl` | 18px/28px 或 20px/28px | `font-semibold`（600） | 页面/卡片主标题 |
| Subtitle | `text-base` | 16px/24px | `font-medium`（500） | 副标题 |
| Body | `text-base` | 16px/24px | `font-normal`（400） | 正文、**所有表单控件**（不能小于 16px，否则触发 iOS Safari 输入框聚焦自动放大页面的 bug） |
| Caption | `text-sm` | 14px/20px | 常规 + `text-text-muted` 灰色 | 次要文字 |
| Price | `text-lg` / `text-xl` | 同 Title | `font-semibold` + `text-text`（黑色，不是强调蓝） | 帖子价格数字 |
| Tag | `text-xs` | 12px/16px | `font-medium`（500） | 分类标签等小标签 |

### 间距

8px 基准刻度：`p-2`(8px) / `p-3`(12px) / `p-4`(16px) / `p-6`(24px），复用 Tailwind 默认的 0.25rem 刻度，没有新建自定义 spacing token。控件高度另按 Tailwind v4 的动态刻度取值（`h-9`=36px 圆形图标按钮、`h-11`=44px 标准按钮/输入框、`h-12`=48px FAB、`h-13`=52px 胶囊搜索框、`h-14`=56px 设置列表行）。

### 圆角

按实际使用场景整理出的一套隐性规律（没有写成正式规范文档，是从组件代码里读出来的）：

| 圆角值 | Tailwind 类 | 使用场景 |
|---|---|---|
| 6px | `rounded-md` | **找搭子活动的方形头像 tile**（`activity-participant-avatars.tsx`，17 号卡明确加的一圈小圆角，区别于圆形头像的 `rounded-full`） |
| 8px | `rounded-lg` | 边框信息框、后台管理列表行、表单 `fieldset` 分组 |
| 12px | `rounded-xl` | 标准按钮、表单输入框、下拉/更多操作菜单弹层 |
| 16px | `rounded-2xl` | 主内容卡片——帖子卡片、活动卡片、分类 tile、聊天气泡 |
| 20px（自定义 token `--radius-profile-card`） | `rounded-profile-card` | "我的"页头像紧凑卡片专属 |
| 26px（自定义 token `--radius-search`） | `rounded-search` | 胶囊搜索框专属 |
| 9999px | `rounded-full` | 圆形头像、圆形图标按钮、FAB、胶囊按钮 |

### 投影

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)` | 双层轻投影，Airbnb 风格的内容卡片 |
| `--shadow-search` | `0 1px 4px rgba(0,0,0,0.06)` | 搜索框，比卡片投影更轻一档 |
| `--shadow-fab` | `0 6px 16px rgba(52,87,232,0.35)` | 悬浮发布按钮专属，带品牌蓝色调（不是中性黑） |
| `--shadow-settings-item` | `0 2px 12px rgba(0,0,0,0.05)` | "我的"/设置页的列表行 |

### 动效

代码里**只有两处**实际用到 transition/animation，没有全局统一的动效规范文件：

| 场景 | 属性 | Duration | Easing | 位置 |
|---|---|---|---|---|
| 消息列表滑动删除，松手回弹 | `transform` | 200ms | `ease-out` | `conversation-swipe-row.tsx`（内联 style，跟手指拖动时不带 transition，松手瞬间才加上） |
| 设置/我的页列表行 hover | `opacity` | 150ms（Tailwind 默认值，未显式覆写） | `cubic-bezier(0.4, 0, 0.2, 1)`（Tailwind `transition-opacity` 默认曲线） | `profile-page.tsx` / `settings-page.tsx` |

---

## Design Philosophy

### 品牌定位

Saminest 是面向 DMV 地区（华盛顿 DC、弗吉尼亚、马里兰）华人社区的同城生活服务 App，核心场景是租房、求租、二手交易和"找搭子"社交。目标用户是初到或长居 DMV 的华人，产品的第一要务是**降低信任门槛**——同城陌生人之间的租房/交易/约伴天然带着警惕，界面语言必须传递"简洁、可信赖、不浮夸"，而不是用花哨的视觉去争夺注意力。这决定了整个设计系统排斥任何多余的强调色、复杂动效或视觉噪音：一套蓝色、克制的圆角层级、几乎不做动效，都是这个定位的直接推论，不是能力限制。

### 色彩策略

全站只用 `#3457E8` 这一支蓝作为唯一的品牌强调色，深浅两级（`primary-dark` / `primary-light` / `primary-soft`）服务于状态区分（hover、场景区分、高亮背景、空状态），不引入第二个色相。这个约束本身就是"可信赖"这个定位的视觉体现——同城生活服务类产品（对标 Craigslist、Facebook Marketplace 这类)最怕的是视觉上显得杂乱随意，单一强调色相能天然维持克制感。中性色阶（`bg` 画布灰、`card` 纯白、三级文字灰）之间的对比也刻意做得柔和（`text-muted` #8A8A8E、`text-subtle` #B0B0B5 都不是死黑/死灰），呼应 iOS 原生系统 App（如"信息"、"设置"）的柔和中性色调，而不是安卓 Material Design 那种更高饱和度的配色逻辑。

### 排版

字体不做任何自定义加载，直接使用系统默认字体栈——这是刻意的技术选择而不是遗漏：系统字体在目标平台（iOS Safari/WebView、Android Chrome）上零加载延迟、零 FOUT，且天生贴合"原生 App"的观感（不是网页硬凹的字体）。字号层级按 Title/Subtitle/Body/Caption/Price/Tag 六级语义划分，而不是按"h1/h2/h3"这种文档式层级，因为信息流卡片、表单、列表行才是这个 App 里最主要的界面形态，语义化的字号命名更贴近实际使用场景。价格数字统一用主文字黑色而不是强调蓝，是为了在信息流里让"内容本身"（标题、价格）保持视觉主导，蓝色只留给真正需要引导操作的地方（按钮、链接、选中态），这也是从 Craigslist 式"信息优先、装饰克制"列表页借鉴来的取舍。

### 布局与留白

间距锚定 8px 基准刻度，页面级留白参照 Airbnb 卡片流的呼吸感——卡片之间、卡片内部各元素之间统一用 8/12/16/24px 这几档，不用零散数值去凑视觉效果。信息流页面（首页/分类页）采用两列网格卡片，图片区域占比大、文字区域精简到"标题+价格"两行，这是从小红书式的信息流浏览体验借鉴的取舍：用户应该能像刷图片流一样快速扫过大量卡片，靠图片本身（而不是密集文字）做第一轮筛选，只有点进详情页才展开完整信息。

### 层次与深度

投影整体极轻（`shadow-card` 的双层阴影 opacity 只有 4-6%），呼应 Airbnb 式"近乎扁平但有一丝浮起感"的卡片层级，而不是强投影、强边框那种"卡片感"过重的设计。唯一投影明显加重、且带品牌色调的地方是悬浮发布按钮（`shadow-fab`，蓝色投影），这是刻意的——全站只有这一个元素需要"漂浮在内容之上、随时可点"的强存在感，其余界面元素都不应该抢它的视觉优先级。

### 形状语言

圆角随"元素的功能层级"递进，不是随便取值：功能性小元素（找搭子方形头像 6px、边框信息框 8px）用小圆角，交互控件（按钮、输入框 12px）中等圆角，主内容容器（卡片 16px）更大的圆角，纯装饰/强调型元素（胶囊搜索框 26px、圆形头像/按钮 9999px）用最大或全圆。这套递进关系整体贴近 iOS 原生控件的圆角观感（iOS 系统 App 的按钮/卡片/输入框也遵循类似的"越是容器级元素、圆角越大"的规律），而不是 Material Design 那种圆角更统一、更方正的语言。

### 动效

全站动效极度克制，只在两个真正需要"物理反馈感"的地方使用：消息滑动删除的回弹（200ms ease-out，模拟手势松手后的物理回弹）和列表行 hover 的透明度渐变（Tailwind 默认 150ms）。没有页面转场动画、没有加载骨架屏动效、没有卡片进场动画——这不是技术欠缺，而是与"简洁可信赖"的定位一致：同城生活服务类工具型 App，用户要的是快速找到房源/搭子/买家，动效每多一分都是在消耗用户完成任务的耐心，这里选择把动效预算完全留给真正需要物理反馈的手势交互，其余场景一律"即时响应、无多余过渡"。

---

## 备注（写这份文档时发现的、值得你知道的信息）

- 你给的 token 命名 `--app-blue` / `--app-blue-dark` / `--app-blue-light` / `--app-bg` / `--app-card` 在代码里**不存在**——实际的 CSS 变量名是 `--color-primary` / `--color-primary-dark`（和数值相同但语义独立的 `--color-primary-hover`）/ `--color-primary-light` / `--color-bg` / `--color-card`（都定义在 `src/index.css` 的 `@theme` 块里，没有 `app` 前缀）。这份文档里全部用的是真实变量名，不是你给的那套猜测命名，如果别处文档/工具依赖 `--app-*` 这个命名，需要你确认要不要专门做一次改名。
- "字体用 Noto Sans SC" 这个前提在代码里也**不成立**——项目没有加载 Noto Sans SC 或任何自定义字体，全站是 Tailwind 默认系统字体栈，"Noto Sans"只是这个栈里的一个 fallback 名字，不是主动选择。已经在上面"字体"小节如实写清楚了。
