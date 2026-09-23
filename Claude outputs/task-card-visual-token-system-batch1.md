# 任务卡（第一批 / 共两批）：全 App 视觉 Token 体系落地 —— Token 本身 + 首页/找搭子/消息列表/帖子详情

## 对应 worktree
路径：`../saminest-v2-visual-tokens-batch1`
分支：`feat/visual-token-system-batch1`（从 `origin/main` 切出）

## 背景

BARRY 提出了一套完整的全 App 视觉 Token 体系（颜色/圆角/阴影/文字层级），目标是解决"纯白刺眼"的问题，同时避免"首页好看了，其它页面还是各自一套白色"这种不统一的状态。整体思路是：**页面背景用浅灰、卡片用白（但不是纯白 #FFFFFF，也不是灰阶）、蓝色主色只用在少数关键点、不要大面积上色**——参考 Airbnb/Facebook Marketplace/Apple 原生设计语言，不是小红书/游戏那种风格。

这是这次 session 里规模最大的一次改动，BARRY 明确要求**只动颜色/边框/阴影/圆角/文字色，不碰布局、组件结构、交互逻辑**——项目已经上线 App Store，这条约束必须严格遵守，不是可选项。

**分两批做**：这张任务卡是第一批——把 Token 体系本身落地到 `src/index.css`，然后覆盖曝光量最高的四个页面/组件（首页信息流、找搭子列表、消息列表、帖子详情页）。BARRY 会先在真机上确认这一批效果，确认没问题之后我们再开第二批任务卡，扫剩下的所有页面（发布、登录注册、搜索、筛选、收藏、我的、聊天、设置、Modal、Bottom Sheet、Loading、Empty、Error 等）。**这张任务卡不覆盖第二批范围内的任何文件**，不要提前动。

跟 BARRY 确认过两个具体分歧点：
1. **未读消息徽章保留红色**，不改成 BARRY 原方案里的蓝色——红色是微信/Facebook/iOS 系统级的通用语言，且消息 tab 选中态本身就是蓝色，未读点如果也用蓝色对比度会被削弱。
2. **本次是在今天早些时候刚做完的"背景色改中性浅灰+卡片边框投影"那次调整基础上，再做一版更完整的**——`--color-bg` 今天已经从 `#f3f5fa` 改成过一次 `#f5f5f5`，这次是第二次改（改成 `#F5F7FB`），不是从零开始，注意 `src/index.css` 里这块的注释要更新成反映最新这次改动的说明，不要保留误导性的旧注释。

## Token 映射（现有 `@theme` 命名 → 新数值 / 新增 token）

项目用的是 Tailwind v4 的 CSS-first `@theme` 配置（`src/index.css`，没有 `tailwind.config.js`），**不是**直接复制 BARRY 原方案里的 `:root { --primary: ... }` 这种通用 CSS 变量写法。下面这张表已经把 BARRY 的方案映射到项目现有的 `--color-*` 命名上——**能复用现有 token 名字的一律复用，只改数值；确实没有对应物的才新增**，不要在项目里同时搞出两套语义重复、命名不同的颜色系统（这正是之前审计出来的 `bg-white`/`bg-card` 那个 P1 问题的教训，不要重蹈覆辙）。

### 改数值（token 名字不变）

| 现有 token | 旧值 | 新值 |
|---|---|---|
| `--color-primary` | `#3457e8` | `#315BEA` |
| `--color-primary-hover` | `#2743b8` | `#2B52D4` |
| `--color-primary-light` | `#eef1fd` | `#EAF0FF` |
| `--color-accent` | `#3457e8` | `#315BEA`（跟 primary 保持同值，项目里历史上就是这个约定，见文件里原有注释） |
| `--color-bg` | `#f5f5f5` | `#F5F7FB` |
| `--color-text` | `#1c1c1e` | `#20242C` |
| `--color-text-muted` | `#8a8a8e` | `#697386` |
| `--color-text-subtle` | `#b0b0b5` | `#9AA3B2` |
| `--color-border` | `#ececef` | `#E7EAF0` |
| `--color-success` | `#2e7d32` | `#2E9B62` |
| `--color-warning` | `#b7791f` | `#D98B24` |
| `--color-danger` | `#c0392b` | `#D94B4B`（BARRY 方案里叫 `error`，项目里这个语义一直叫 `danger`，**沿用现有名字，不改名**，避免一次多余的全站改名） |
| `--color-card` | `#ffffff` | `#FFFFFF`（数值不变，BARRY 方案里的 `surface` 就是这个） |

### 新增 token

| 新 token 名 | 值 | 用途（对应 BARRY 方案里的名字） |
|---|---|---|
| `--color-primary-pressed` | `#2449C9` | 按钮按下态（`primary-pressed`） |
| `--color-primary-lighter` | `#F3F6FF` | 比 `primary-light` 更淡一档（`primary-lighter`） |
| `--color-bg-secondary` | `#F0F3F8` | 次级页面背景（`background-secondary`） |
| `--color-surface-muted` | `#EEF1F7` | 弱化表面/图片占位底色（`surface-muted` 和 `image-placeholder` 是同一个值，这次不重复建两个名字，统一用这一个） |
| `--color-surface-hover` | `#F8F9FC` | 列表项 hover 态（`surface-hover`） |
| `--color-surface-pressed` | `#F0F2F6` | 列表项按下态（`surface-pressed`） |
| `--color-text-placeholder` | `#A8AFBC` | 输入框占位文字（`text-placeholder`） |
| `--color-text-disabled` | `#C3C8D1` | 禁用态文字（`text-disabled`） |
| `--color-border-light` | `#ECEEF3` | 比 `--color-border` 更淡一档的分割线（`border-light`） |
| `--color-divider` | `#E9ECF2` | 列表项之间的分割线，专门给消息列表这类场景用（`divider`） |
| `--color-success-light` | `#EAF7F0` | 成功态浅底色 |
| `--color-warning-light` | `#FFF5E6` | 警告态浅底色 |
| `--color-danger-light` | `#FDEEEE` | 错误态浅底色（对应 BARRY 的 `error-light`） |
| `--color-info` | `#4C78E8` | 信息提示色 |
| `--color-info-light` | `#EDF2FF` | 信息提示浅底色 |
| `--color-image-placeholder-icon` | `#A7AFBD` | 图片占位图标颜色 |
| `--color-nav-icon` | `#8C95A3` | 底部导航未选中图标颜色（比 `--color-text-muted` 稍浅，专门给导航用，不复用 text-muted） |
| `--color-overlay` | `rgba(20, 26, 38, 0.45)` | 弹窗/BottomSheet 遮罩层，替代黑色遮罩 |

**不新增**的几个（复用现有的就够，不要为了跟 BARRY 原方案的名字一一对应而硬造重复 token）：
- `navigation-background` → 直接用 `--color-card`（都是纯白，没必要单独建）。
- `navigation-active` → 直接用 `--color-primary`。
- `surface-elevated` → 这次跟 `--color-card` 同值，暂不新增，等真的出现"需要比普通卡片更"浮起来"一级"的场景（这批范围内没有）再说。
- `text-on-primary` → 就是白色，直接用 Tailwind 的 `text-white`，不需要语义 token。

### 圆角（新增两个 token，其它复用 Tailwind 默认档位）

| 场景 | 值 | 怎么做 |
|---|---|---|
| 大卡片（帖子卡片、找搭子卡片等主要信息卡片） | 20px | **新增** `--radius-card-lg: 20px`，这批范围内的 `post-list.tsx`（grid/wanted 两个 variant）和找搭子列表卡片要从现在的 `rounded-2xl`（16px）改成这个新 token（Tailwind v4 里自定义 radius token 会自动生成对应的 `rounded-*` 工具类，命名规则按项目里 `--radius-search`/`--radius-profile-card` 已有的先例来，去 `src/index.css` 里抄现成的写法） |
| 普通卡片（次要信息、非主力曝光位） | 16px | 复用 Tailwind 默认 `rounded-2xl`，不用新建 token，这批没有需要改的场景 |
| 输入框 | 12px | 复用 Tailwind 默认 `rounded-xl` |
| 按钮 | 14px | **新增** `--radius-button: 14px`（Tailwind 默认档位里 12/16 之间没有 14，这批范围内"发起搭子"按钮等主要 CTA 按钮要用这个；次要/图标按钮维持现状不用改） |
| Pill/标签 | 999px | 复用 Tailwind 默认 `rounded-full` |
| Bottom Sheet / Modal | 24px | 复用 Tailwind 默认 `rounded-3xl`（这批不涉及具体 Modal/BottomSheet 文件，先把这行约定写进 `src/index.css` 注释里，留给第二批用） |
| 头像 | 50% | 复用 Tailwind 默认 `rounded-full`，现状本来就是这样，不用改 |
| 图片 | 16px | 复用 Tailwind 默认 `rounded-2xl`，现状本来就是这样 |

**这条明确是一次全站级别的圆角约定变更**（`DESIGN.md` 里现有"主内容卡片统一 rounded-2xl/16px"这条要跟着更新说明，不是偷偷改掉不留痕迹）——`--radius-card-lg`（20px）专门给"帖子卡片/找搭子卡片"这类主力曝光位用，其它现状用 16px 的次要卡片场景这批不用动。

### 阴影（更新数值）

| 现有 token | 旧值 | 新值 |
|---|---|---|
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)` | `0 1px 2px rgba(20,30,50,0.03), 0 4px 12px rgba(20,30,50,0.04)` |
| `--shadow-fab` | `0 6px 16px rgba(52,87,232,0.35)` | `0 6px 16px rgba(49,91,234,0.18)`（RGB 分量跟着新的 `--color-primary` 数值同步换算过，透明度也降低了，参照 BARRY 给的按钮阴影数值） |

## 每个文件的要求

### 1. `src/index.css`

按上面三张表把 `@theme` 块里的数值改掉、新 token 加进去。**保留现有的段落结构和大部分现有注释的写法习惯**（这个文件历史上每次改动都留了详细的"为什么改"说明，这次也要延续这个习惯），但要更新顶部关于 `--color-bg`/`--color-primary` 的注释，反映这是"第二轮视觉统一"而不是重复贴今天早上那版的旧说明。

新增的圆角 token（`--radius-card-lg`、`--radius-button`）按现有 `--radius-search`/`--radius-profile-card` 的写法加在同一个圆角小节里，补一句注释说明这两个是这次新加的、对应哪些场景。

`body { background-color: var(--color-bg); }` 这行不用动，`--color-bg` 数值变了它自动跟着变。

### 2. `src/features/posts/post-list.tsx`

grid variant 和 wanted variant 两个卡片容器，圆角从 `rounded-2xl` 换成新的大卡片圆角 token（用 `--radius-card-lg` 生成的那个 `rounded-*` 工具类）。今天早上这批已经加过的 `border border-border shadow-card` 保留，不用重新加一遍——`border-border`/`shadow-card` 这两个 class 引用的 token 数值变了，样式会自动跟着更新，不用改 class 名本身。

顺手 grep 一下这个文件里有没有硬编码的十六进制颜色（比如占位图标颜色、分类标签背景色）跟这次新 token 语义重复的，有的话换成对应 token；没有就不用额外造场景去改。

### 3. 找搭子列表页面（找 `活动列表`/`activity-card.tsx`/找搭子相关页面，具体文件名以代码里实际结构为准，不要凭空猜）

对应 BARRY 截图那个"发起搭子"页面。卡片圆角同上换成大卡片 token；图片占位区域背景色换成 `--color-surface-muted`，占位加号图标颜色换成 `--color-image-placeholder-icon`；"还差 N 人"这类次要文字用 `--color-text-muted`（数值已经改成新的 `#697386`，不用新起一个 class）；"x/8"这种更弱的信息用 `--color-text-subtle`；"发起搭子"主 CTA 按钮圆角换成 `--radius-button`，背景/文字色沿用 `--color-primary`（会自动生效），按钮阴影可以加 BARRY 给的那个轻投影（参照新的 `--shadow-fab` 数值，或者如果这个按钮跟 FAB 组件本来就是同一个东西，直接复用 `--shadow-fab` 不用另建）。

### 4. 消息列表页面（`conversation-list-page.tsx`）

页面背景走全局 `--color-bg`（一般不需要单独设置，body 已经是这个底色，除非这个页面有自己单独覆盖了背景色，那种情况下要去掉那个覆盖，让它自然继承全局背景）。消息 item 背景 `--color-card`；item 之间的分割线换成 `--color-divider`（不是 `--color-border`——这次特意区分了"卡片边框"和"列表分割线"两种语义，分割线更淡）。

**未读消息徽章：确认现在的实现用的是什么颜色**——如果已经是红色（不管是硬编码红色还是某个 token），这次**不用改**，维持现状；如果发现现在用的是蓝色/其它颜色，改成红色（对应 `--color-danger`，不新建 `--color-unread` 这种专用 token，语义上就是"需要注意"，跟错误态共用一个红色语义没问题）。这条不要凭我这边猜，去代码里确认现状之后再决定动不动。

### 5. 帖子详情页（`post-detail-page.tsx`）

主标题用 `--color-text`；地点/时间这类次要信息用 `--color-text-muted`；价格用 `--color-text`（跟主标题同色，项目里价格本来就是黑色不是强调色，这条现状不变，见 `src/index.css` 顶部关于"价格用 text-text 不是 text-accent"那条已有注释，这次不推翻它）；主要 CTA（如果这个页面有报名/联系类按钮）按钮圆角换成 `--radius-button`。页面背景/卡片背景照全局 token 自动生效，不用手动改这个文件里的背景色（除非发现有硬编码覆盖）。

## 明确不做的事

- **不碰布局、组件结构、交互逻辑**——这条 BARRY 特别强调过，项目已经上线 App Store。这次只改颜色/边框/阴影/圆角/文字色相关的 class 和 token 数值，不删加任何 DOM 结构、不改任何状态逻辑、不改任何跳转/请求逻辑。
- **不碰第二批范围内的任何文件**——发布页、登录注册、搜索、筛选、收藏、我的、聊天页、设置、Modal、Bottom Sheet、Loading、Empty、Error 状态，这些全部留到第二批任务卡，这次完工报告里如果提到"顺手也改了"某个不在这张卡范围内的文件，算范围外改动，需要单独说明理由。
- **不改未读消息徽章的颜色决策**——BARRY 已经确认保留红色，不要因为看到 BARRY 原方案文字里写的是蓝色就自己改成蓝色。
- **不改 `--color-primary-dark`/`--color-primary-soft`/`--color-chevron` 这几个现有 token 的数值**——BARRY 方案里没有明确覆盖这几个，这次不动，等第二批扫到具体用到它们的页面时再看要不要跟着调。
- **不新建 dark mode**——这次改动只影响浅色模式下的观感。
- **不做"把所有灰色都合并成一种"这种过度简化**——现在这套 Token 里 `text-muted`/`text-subtle`/`text-placeholder`/`text-disabled` 是四个不同层级，`surface-muted`/`surface-hover`/`surface-pressed`/`bg-secondary` 也是各自不同的场景，照单子上的语义对应场景用，不要图省事全部合并成一两个灰色。

## 验证要求

- 视觉核实：这批四个页面（首页信息流、找搭子列表、消息列表、帖子详情）截图或真机确认，"背景浅灰、卡片白（但不刺眼）、蓝色只在按钮等关键点出现"这个层次感做出来了，不是通篇灰蒙蒙或者通篇还是白花花一片。
- 未读消息徽章颜色：明确在完工报告里说清楚"改动前是什么颜色、这次有没有动、为什么"，不要跳过这条不提。
- `npm run typecheck && npm run test && npm run build` 全部通过——这批涉及不少 class 改动，`.test.*` 文件里如果有断言具体 class 字符串的，按需同步更新，不代表出了其它问题。
- 这次改动的 `--color-primary`/`--color-bg`/`--color-text` 等 token 是全站几十上百处复用的，完工后确认一下**没有在这四个文件之外**引入任何视觉断裂（比如某个复用了 `--color-primary` 的地方因为这次改动意外变得不可读）——这个不用逐页面截图，但至少跑一遍 build、留意一下有没有明显的对比度问题。
