# Saminest v2 UI 审计报告（批次 0）

审计范围：`C:\Users\32092\Documents\Codex\saminest-v2`。本次为只读审计，未修改任何文件，未执行任何 git 命令，未涉及 Supabase / RLS / 业务逻辑。

---

## A. 项目 UI 结构概览

**技术栈实况（与需求描述有出入，见下方“重要偏差”）**

- React 19 + TypeScript + Vite 6（`package.json`）
- Tailwind CSS v4，通过 `@tailwindcss/vite` 插件接入（`vite.config.ts`），**没有** `tailwind.config.*` 文件——v4 用 `src/index.css` 里的 `@theme` 块代替传统 config，这是符合 Tailwind v4 用法的，不是缺失。
- **shadcn/ui 未安装、未初始化**：仓库根目录没有 `components.json`，`src` 下没有 `components/ui` 目录，`package.json` 里没有 `@radix-ui/*`、`class-variance-authority`、`clsx`、`tailwind-merge` 中任何一个依赖。全站所有交互元素（按钮、输入框、下拉、对话框）都是手写原生 HTML 标签 + Tailwind 类名。
- 没有图标库（`lucide-react` 等未安装），图标位置一律用 Unicode 符号/emoji 代替（`←` 返回、`⋯` 更多、`›` chevron、`★/☆` 收藏、`♥` 收藏数、`🖼` 图片占位）。
- 状态管理：Zustand（`src/store/auth-store.ts`），数据层：TanStack Query + Supabase JS。

**主要页面**（`src/pages/**/*-page.tsx`，来自 `src/router/routes.tsx`）

首页 `home/home-page.tsx`、分类页 `category/category-page.tsx`、分类列表 `categories/categories-page.tsx`、帖子详情 `post/post-detail-page.tsx`、发布/编辑 `publish/publish-page.tsx`、举报 `report/report-post-page.tsx`、消息列表 `messages/conversation-list-page.tsx`、单个会话 `messages/conversation-page.tsx`、收藏 `favorites/favorites-page.tsx`、我的 `profile/profile-page.tsx`、我的发布 `my-posts/my-posts-page.tsx`、登录/注册/忘记密码/重置密码、404、五个后台管理页（`pages/admin/*`）。

**主要布局组件**（`src/components/`）

- `app-shell.tsx`：根路由 `element`，渲染 `AppHeader` + `<Outlet/>` + `BottomNav`，仅在 `/messages/:conversationId` 精确匹配时隐藏两者。
- `app-header.tsx`：全局顶部栏（sticky，h-14）。
- `bottom-nav.tsx`：移动端底部导航（`md:hidden`），桌面端导航塞在 `AppHeader` 里的 `hidden md:flex` 区块。

**主要复用组件**（`src/components/`，仅 4 个非布局组件）

`favorite-button.tsx`、`contact-seller-button.tsx`、`post-image-picker.tsx`，以及上面两个布局组件。**没有** PageContainer、PageHeader、Card、EmptyState、SearchBar 等任何跨页面共享的 UI 组件——所有页面容器、卡片、空状态都是逐页手写。

**shadcn 基础组件**：无（`src/components/ui` 目录不存在）。

**Tailwind / 主题入口**：`src/index.css`（唯一样式入口，`@import "tailwindcss"` + 一个 `@theme` 块定义颜色/圆角/阴影 token，见下文 C 节）。`main.tsx` 里 `import "./index.css"` 是唯一引用点。

---

## 重要偏差说明（先于 B 节列出，避免后续结论建立在错误假设上）

1. **shadcn/ui 事实上未接入**。任务需求把 shadcn/ui 列为技术栈之一，但当前仓库没有安装、没有 `components.json`、没有 `src/components/ui`。批次 1 如果要“更新 shadcn 基础组件，但保持 API 尽量兼容”，前提是先决定要不要在这个批次里初始化 shadcn——这是一个需要用户确认的范围问题，不属于纯审计结论，我不在这里替用户做决定。
2. **筛选系统（FilterChip / FilterBar / FilterSheet / ActiveFilters）尚未实现**。全仓库搜索没有找到任何 Sheet、Dialog（除 `my-posts-page.tsx` 里一个一次性的删除确认弹窗）、价格区间、排序控件。当前“筛选”能力仅等于：分类 pill 导航（`CategoryNav`）+ 一个防抖搜索框。`use-posts-query.ts` 的查询参数只有 `categoryId` / `searchQuery` / `page`，没有价格、地区、排序等参数。批次 4 的“筛选系统”改造在当前代码基础上是**新建**，不是“重构已有筛选组件”。
3. **筛选/发布页要求的“租房、求租、二手允许不同 variant / 不同字段”尚未实现**。`posts` 目前是单一表单结构（标题/描述/价格/分类/地区/联系方式），没有按分类区分的专属字段，`ListingCard`（即 `PostList` 内联卡片）也没有 variant 概念。
4. **图片上传的“上传中/成功/失败”状态尚未实现**。`post-image-picker.tsx` 明确只负责“选择、校验、预览、移除”，真正的上传发生在 `publish-page.tsx` 提交时，且是提交阶段整体转圈（`uploadingImages` 一个布尔值覆盖所有图片），不是逐张图片展示上传状态；也没有图片排序、没有“设为主图”功能。
5. **消息列表页要求的“头像、名称、最后一条消息预览、未读状态”均未实现**，`conversation-list-page.tsx` 顶部注释明确写了“这一轮不展示最后一条消息预览”“不拉取头像/昵称”，当前只显示 买家/卖家角色标签 + 关联帖子标题 + 时间。
6. **“我的”页面的“账号与安全”“帮助/协议”分组尚未实现**，当前 `profile-page.tsx` 只有：用户资料卡、我的发布/我的收藏、（管理员）后台管理入口、退出登录。

---

## B. 当前看起来不专业的具体原因

### B1. 同一实体（帖子摘要）在三个页面各自手写一套不同的卡片样式 —— P0

- 涉及页面：首页 / 分类页（瀑布流）、收藏页、我的发布页
- 文件：`src/features/posts/post-list.tsx`（56-100行）、`src/pages/favorites/favorites-page.tsx`（54-69行）、`src/pages/my-posts/my-posts-page.tsx`（222-260行）
- 具体表现：`post-list.tsx` 用 `rounded-2xl border border-border bg-white shadow-card`、4:3 封面图、瀑布流双列；`favorites-page.tsx` 用 `rounded-lg border border-border bg-white p-4`、纯文字无图片、单列横排；`my-posts-page.tsx` 又是 `rounded-2xl border border-border bg-white p-3 shadow-card`、20×20 缩略图 + 状态徽章。三处圆角（`rounded-2xl` vs `rounded-lg`）、有无阴影、有无图片、卡片密度均不一致，且没有一个共享的 `PostCard`/`ListingCard` 组件——JSX 被复制三份并各自演化出不同样式。
- 影响：用户在“收藏”和“我的发布”之间切换时会感觉像是两个不同产品的界面拼在一起；后续新增字段（如收藏数）需要改三处。
- 修复方向：抽出统一 `PostCard`（或 `ListingCard`）组件，用 `variant`（`grid` / `list`）区分展示密度，三处收敛调用。

### B2. FavoriteButton / ContactSellerButton 完全没有 Tailwind 样式，呈现浏览器默认按钮外观 —— P0

- 涉及页面：首页、分类页、帖子详情页、收藏页（凡是用到这两个按钮的地方）
- 文件：`src/components/favorite-button.tsx`（69-76行）、`src/components/contact-seller-button.tsx`（75-81行）
- 具体表现：`<button type="button" aria-pressed={isFavorited} ... >{isFavorited ? "★ 已收藏" : "☆ 收藏"}</button>` 和 `<button type="button" disabled={...} onClick={...}>联系发布者</button>` 都没有任何 `className`。这两个是全站复用最频繁的交互组件，直接渲染成系统默认灰色按钮，字体、内边距、圆角都和周围 Tailwind 化的界面脱节。
- 影响：帖子详情页底部（`post-detail-page.tsx` 99-109行）三个操作并排时，“收藏”“联系发布者”是原生按钮，“举报”却是 Tailwind 样式的 `<Link>`，三者视觉完全不统一，是页面上最显眼的“看起来没做完”的地方。
- 修复方向：给这两个按钮补上与 `Button`/卡片操作按钮一致的 Tailwind 类（或迁移到统一 Button 组件），保持现有 props/事件逻辑不变。

### B3. 分页按钮无任何样式 —— P1

- 涉及页面：首页、分类页（`PostList` 的分页控件）
- 文件：`src/features/posts/post-list.tsx`（104-117行）
- 具体表现：`<button type="button" disabled={page === 0} onClick={...}>上一页</button>` / `下一页` 同样没有 `className`，紧跟在设计精致的瀑布流卡片网格下方，视觉断层明显。
- 影响：内容浏览效率的“最后一步”（翻页）体验最差，容易被认为是未完成的占位。
- 修复方向：补齐按钮样式，或按批次 3 的建议改造为更符合小红书/Marketplace 心智的“到底部自动加载更多”，但那是交互层面的改动，需要单独评估。

### B4. 首页与分类页的搜索框 JSX 被复制两份 —— P1

- 涉及页面：首页、分类页
- 文件：`src/pages/home/home-page.tsx`（28-36行）、`src/pages/category/category-page.tsx`（33-41行）
- 具体表现：两处 `<input type="search" ... className="h-13 w-full rounded-search border border-border bg-bg px-4 text-base text-text shadow-search" />` 几乎逐字符相同，只有 `placeholder` 不同，没有抽成共享 `SearchBar` 组件。
- 影响：不是视觉问题，是“重复布局组件”问题——两处未来任何一次视觉调整（比如加搜索图标）都要改两遍，容易漏改导致不一致。
- 修复方向：抽出 `SearchBar` 组件，`placeholder` 作为 prop。

### B5. 圆角、阴影 token 已建立但业务页面里大量直接写 Tailwind 默认圆角，未使用语义 token —— P1

- 涉及页面：登录、注册、忘记密码、重置密码、发布页、帖子详情页图片、分类列表页
- 文件：`src/pages/login/login-page.tsx`（61、77、88、94行）、`src/pages/publish/publish-page.tsx`（多处 `rounded border`）、`src/pages/categories/categories-page.tsx`（54行 `rounded-lg`）
- 具体表现：`index.css` 里已经用注释明确说明了圆角/间距/字号的语义约定（见 C 节），但登录/注册/发布这类表单页仍然大量使用裸的 `rounded`（4px，Tailwind 默认最小圆角）而不是 `rounded-lg`/`rounded-xl`/`rounded-2xl` 里定义好的档位，和 `post-list.tsx`、`profile-page.tsx`、`my-posts-page.tsx` 里已经统一使用的 `rounded-xl`/`rounded-2xl` 不一致。同一个仓库里，有的页面（`profile-page.tsx`、`bottom-nav.tsx` 的发布按钮）已经在按规范执行，有的页面（表单类页面）像是更早期写的、没有跟上后来定的规范。
- 影响：卡片/按钮/输入框的圆角在“表单类页面”和“列表/我的类页面”之间形成两套视觉语言。
- 修复方向：批次 1 统一圆角 token 后，在批次 2/5 顺带把表单页面的裸 `rounded` 替换为语义化档位（不算“业务页面大范围逐个替换”，因为这些本来就是同一套输入框/按钮的复制体）。

### B6. 底部导航未处理 `env(safe-area-inset-bottom)`，而单个会话页的输入栏已经处理了 —— P1

- 涉及页面：除单个会话页外的所有主要页面（底部导航覆盖的页面）
- 文件：`src/components/bottom-nav.tsx`（60-77行，`fixed inset-x-0 bottom-0`，无 safe-area padding）对照 `src/pages/messages/conversation-page.tsx`（222行，`style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom)) }}`）
- 具体表现：仓库里已经有一处正确处理了 iOS 底部安全区（会话输入栏），但覆盖面更广的全局底部导航反而没有做同样处理。
- 影响：iPhone 带 Home Indicator 的机型上，底部导航的点击区域可能贴近/被系统手势条遮挡。
- 修复方向：批次 2 给 `BottomNav` 补上 safe-area padding，同时检查页面主体内容的 `pb-20`（各页面已有，如 `favorites-page.tsx` 53行 `pb-20 md:pb-6`）是否已经为底部导航留出了足够高度——目前 `pb-20`=80px 是否覆盖“导航自身高度 + safe area”需要在批次 2 里用真机/模拟器验证。

### B7. 发布页是单一长表单，没有分组、没有分类专属字段、没有主图/排序 —— P1

- 涉及页面：发布/编辑页
- 文件：`src/pages/publish/publish-page.tsx`（374-547行）
- 具体表现：分类、地区、标题、描述、价格、联系方式类型、联系方式内容、已上传图片、新增图片、提交按钮，全部在一个 `<form>` 里从上到下平铺，没有任何视觉分组（无小标题、无分隔、无卡片分段）；不区分“基本信息”和“价格与地点”；没有区分租房/求租/二手各自需要的专属字段（当前 schema 本身也没有这些字段，见“重要偏差”第 3 点）；图片没有主图标记、没有拖拽排序。
- 影响：表单长度和认知负担对移动端不友好，和小红书/Airbnb 发布流程的“分步/分组”体验差距明显。
- 修复方向：批次 5 按需求引入 `FormSection` 分组包装现有字段（不改字段本身和提交逻辑），级联到分类专属字段则需要先确认是否属于本次 UI 改造范围（这会触碰表单 schema，按“全局安全要求”第 4 条，不应在纯 UI 批次里做）。

### B8. Header 返回按钮和消息页返回按钮是两套不同实现 —— P2

- 涉及页面：全局（`AppHeader`）vs 单个会话页
- 文件：`src/components/app-header.tsx`（21-30行，纯文字 `←`，`text-lg`，无点击区域约束）对照 `src/pages/messages/conversation-page.tsx`（122-129行，`flex h-11 w-11 items-center justify-center rounded-full ... focus:ring-2`）
- 具体表现：`AppHeader` 的返回按钮没有固定点击区域尺寸（不满足 44×44px 的可点击区域建议），也没有 `focus-visible` 环状态；会话页自己实现的返回按钮反而做对了（`h-11 w-11` = 44px、有 focus ring）。
- 影响：全局最高频的返回操作在移动端触控精度不够，且两个返回按钮长得不一样。
- 修复方向：批次 2 把 `AppHeader` 的返回按钮统一成会话页那种 `IconButton` 实现（44×44 点击区域 + focus ring），会话页可以反过来复用这个组件。

### B9. 帖子详情页操作区（收藏/联系/举报）纯 `flex` 平铺，无分组无强调层级 —— P2

- 涉及页面：帖子详情页
- 文件：`src/pages/post/post-detail-page.tsx`（99-110行）
- 具体表现：`<div className="flex items-center gap-4">` 里三个操作平权摆放，“联系发布者”这个转化关键操作没有视觉强调（尤其在 B2 未修复、它还是无样式原生按钮的情况下）。
- 影响：详情页最重要的行动点不突出，跟 Airbnb/Marketplace“主要 CTA 突出、次要操作弱化”的信任感设计目标有差距。
- 修复方向：批次 3/6 讨论时明确“联系发布者”为主按钮样式，收藏为次按钮/图标按钮，举报弱化为纯文字链接（现状已经是链接，可保留）。

### B10. 没有统一的 Empty/Loading/Error 展示组件，纯文字反复手写 —— P2

- 涉及页面：几乎所有列表页（分类、收藏、我的发布、消息列表、帖子详情）
- 文件：例如 `src/pages/favorites/favorites-page.tsx`（21-48行）、`src/pages/categories/categories-page.tsx`（17-45行）、`src/pages/my-posts/my-posts-page.tsx`（179-208行）
- 具体表现：每个页面都手写三段几乎一致的 `if (isPending) {...} if (isError) {...} if (empty) {...}`，文案和 `role="status"`/`role="alert"` 约定是统一的（这点做得好，见 C 节），但 JSX 结构、`className`（`text-sm text-text-muted` / `rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger`）在十几个文件里被逐字复制。
- 影响：不是视觉不一致（视觉其实是一致的），而是维护成本和“看起来是否专业”无直接关系，但和需求里“重复布局组件”“基础样式重复”的检查项直接相关。
- 修复方向：批次 1/2 抽出 `LoadingState`/`ErrorState`/`EmptyState` 三个小组件，文案继续按页面传入，不改变任何可见文案和行为。

---

## C. 设计系统使用情况

**颜色来源**：`src/index.css` 第 24-34 行 `@theme` 块，定义了 `--color-primary` `--color-primary-hover` `--color-accent` `--color-bg` `--color-text` `--color-text-muted` `--color-border` `--color-success` `--color-warning` `--color-danger`，共 10 个颜色 token，全部通过 Tailwind v4 `@theme` 自动生成 `bg-primary`/`text-danger` 等工具类。**没有发现游离于这套 token 之外的硬编码十六进制颜色**，唯一例外是 `profile-page.tsx` 第 20 行 `chevronClassName` 里的 `text-[#999]`（任意值语法，不是 token）和 `index.css` 第 66 行的 `.bg-profile-page { background-color: #f8f8f6; }`（后者注释里说明是刻意用独立 class 而非改全局 token，理由合理）。**注意**：需求文档给出的目标色板（`primary: #246BCE` 等）和当前实际使用的色值（`primary: #2563eb`）**不是同一套颜色**——批次 1 如果要落地需求里给的具体色值，是要替换现有 token 的值，而不是新增一套。

**字体来源**：未在 `index.css` 或任何配置里显式设置 `font-family`，依赖浏览器/Tailwind 默认字体栈（Tailwind v4 默认是系统字体栈）。需求里要求的 `Inter, SF Pro Text, SF Pro Display, PingFang SC, Microsoft YaHei, system-ui, sans-serif` 这套具体字体栈目前**没有配置**。

**圆角使用情况**：`index.css` 已定义两个具名圆角 token（`--radius-search: 26px`、`--radius-profile-card: 20px`），其余圆角依赖 Tailwind 默认档位（`rounded`=4px、`rounded-lg`=8px、`rounded-xl`=12px、`rounded-2xl`=16px、`rounded-full`）。已建立“页面主标题用 `rounded-2xl`”之类的口头约定（见 `index.css` 注释），但如 B5 所述，表单类页面未跟进执行，圆角在不同页面间不完全统一。

**间距使用情况**：`index.css` 顶部注释明确约定“8/12/16/24px”四档间距节奏，对应 Tailwind `p-2/p-3/p-4/p-6`；从实际页面看（`px-4` 左右边距在几乎所有 `<main>` 里反复出现）基本遵循了这个约定，是本仓库执行得较好的一项。

**阴影使用情况**：`index.css` 定义了 4 档具名阴影 token（`--shadow-card`、`--shadow-search`、`--shadow-fab`、`--shadow-settings-item`），且注释明确写了“Airbnb 风格的双层轻阴影”“禁止大面积深色阴影”的设计意图——**这一项已经和需求里的“全局安全要求”高度吻合**，没有发现过重阴影。唯一的阴影使用缺口是 B1 提到的 `favorites-page.tsx` 卡片完全没用阴影 token（`shadow-card`），与 `post-list.tsx`/`my-posts-page.tsx` 不一致。

**Button / Input / Card / Dialog / Sheet 是否统一**：**不统一，且不存在这些组件本身**——它们都是每个页面里手写的原生标签 + Tailwind 类名组合。`Dialog`/`Sheet` 目前仅有一个实例（`my-posts-page.tsx` 319-353 行的删除确认弹窗，`role="dialog"` 手写），代码注释里明确写了“这个仓库目前没有任何弹出层/浮层组件”。

**是否存在重复组件**：是，见 B1（三套帖子卡片）、B4（两份搜索框）、B10（重复的 Loading/Error/Empty JSX）。

**是否存在硬编码色值或魔法数字**：整体较少，主要例外是 `profile-page.tsx` 的 `text-[#999]`、`h-23`（92px，Tailwind 默认档位没有 23，这是任意值）、`index.css` 里 `.bg-profile-page` 的裸色值（有注释说明原因，可接受）。

---

## D. 页面专项结论

### 1. 首页（`src/pages/home/home-page.tsx`）

- **优点**：搜索防抖交互（400ms）设计合理且有注释解释设计动机；直接复用 `PostList`，没有为首页单独发明一套帖子渲染逻辑；瀑布流双列布局（`columns-2`）视觉密度符合小红书心智。
- **问题**：搜索框 JSX 和分类页重复（B4）；`<h1>Saminest</h1>` 无任何样式，作为页面顶部第一个可见元素显得突兀（第 27 行）；翻页按钮无样式（B3）；没有 Hero/推荐位，目前是“搜索框 + 分类 pill + 列表”三段式，基本符合“不使用过度装饰”的要求，但也意味着当前视觉上非常朴素，接近未完成状态。
- **最重要的三个改进**：抽出共享 `SearchBar`；给 `<h1>` 定义或直接移除（如果只是无障碍用途可以做成 `sr-only`）；统一分页/加载更多的视觉。
- **是否适合直接重构**：适合，风险低，页面逻辑简单，主要是抽组件 + 补样式。
- **涉及的共享组件**：`SearchBar`（待建）、`CategoryNav`（已存在，见下）、`PostCard`（待建）。

### 2. 帖子卡片（`src/features/posts/post-list.tsx` 内联实现，非独立组件文件）

- **优点**：4:3 封面图比例固定；标题 `line-clamp-2` 已实现两行截断；图片加载失败/缺失有稳定占位（`data-testid="post-thumbnail-placeholder"`，🖼 图标）；价格用 `text-lg font-semibold text-accent` 突出，标题用 `text-base` 不抢价格；圆角、阴影都用了 token（`rounded-2xl` / `shadow-card`）。
- **问题**：不是独立组件，是 `PostList` 内联的一段 JSX（B1）；收藏按钮无样式（B2）；三个不同页面各有一份不一致的“卡片”实现（B1）；没有 variant 概念区分租房/求租/二手。
- **最重要的三个改进**：抽成独立 `PostCard` 组件并在三处复用；修复收藏按钮样式；评估是否需要按分类区分卡片信息（比如租房显示卧室数，当前 schema 不支持，需先确认范围）。
- **是否适合直接重构**：适合，且优先级最高，因为它是全站曝光量最大的 UI 元素。
- **涉及的共享组件**：`PostCard`（待建）、`FavoriteButton`（已存在，需要补样式）。

### 3. 顶部栏（`src/components/app-header.tsx`）

- **优点**：`sticky top-0` + 固定 `h-14`（56px），高度统一；`showBackButton` 逻辑简单清晰；桌面端导航（`hidden md:flex`）和移动端底部导航分工明确，注释里解释了为什么不在这里重复渲染分类导航。
- **问题**：返回按钮无固定点击区域尺寸、无 focus 样式（B8）；“发布”按钮样式（`rounded-xl bg-accent`）和底部导航里浮起的圆形“发布”按钮是两套完全不同的视觉表达，同一个入口在两个导航里长得不一样；顶部栏在会话详情页完全不渲染（由页面自己实现 Header），这是合理的架构选择但意味着“顶部栏高度统一”这一条在会话页需要单独核对（会话页自己也用了 `h-14`，实测是一致的）。
- **最重要的三个改进**：统一返回按钮为 `IconButton`；统一“发布”入口在顶部栏和底部导航中的视觉表达（或明确说明二者定位不同，移动端底部导航的圆形按钮更突出是有意为之）；补充桌面端导航态的 active 状态（当前 `Link` 没有区分当前页）。
- **是否适合直接重构**：适合，改动面小。
- **涉及的共享组件**：`IconButton`（待建）。

### 4. 底部导航（`src/components/bottom-nav.tsx`）

- **优点**：`aria-current="page"` 高亮当前项，逻辑复用（前缀匹配）写得清楚；`md:hidden` 明确只在移动端渲染；发布入口用浮起的圆形按钮（`-mt-6 h-14 w-14 rounded-full`），是常见的“中间强调”模式，没有做成夸张的大尺寸悬浮球或脱离导航栏的 FAB。
- **问题**：未处理 `env(safe-area-inset-bottom)`（B6）；各 `<Link>` 没有显式点击区域高度／宽度约束（`flex-1` + `py-2`，实际高度取决于文字行高，未必达到 44px）；导航项之间没有视觉分隔，纯靠颜色区分激活态，弱视力用户可能难以分辨。
- **最重要的三个改进**：补 safe-area padding；给每个导航项一个显式最小高度（如 `min-h-[56px]`）确保点击区域；评估是否需要给激活项加图标（目前纯文字，和需求里“图标库”要求有差距——当前项目完全没有图标库，见下方“图标使用”专项）。
- **是否适合直接重构**：适合，但需要先确认批次 2 是否引入图标库（这会改变底部导航的视觉重量，属于范围决策）。
- **涉及的共享组件**：无独立子组件，逻辑集中在这一个文件里。

### 5. 筛选（不存在独立筛选系统）

- **当前状态**：**尚未实现**。现有能力仅为 `CategoryNav`（分类 pill，`src/features/categories/category-nav.tsx`）+ 页面内搜索框。没有价格区间、排序、地区多选等筛选维度，没有 `FilterChip`/`FilterBar`/`FilterSheet`/`ActiveFilters` 组件或类似实现，`use-posts-query.ts` 的查询入参也不支持这些维度。
- **结论**：批次 4 在这个仓库里是新建一套筛选系统，不是重构。是否需要联动扩展 `posts` 查询参数（属于业务逻辑范畴）需要在批次 4 启动前单独确认范围边界。

### 6. 发布页（`src/pages/publish/publish-page.tsx`）

- **优点**：新建/编辑复用同一组件，逻辑边界注释详尽；图片上传失败容错设计合理（`Promise.allSettled`，部分失败不影响帖子创建）；已删除图片的即时反馈（`removingImageId`）和禁用态处理到位；表单字段本身的校验、`aria-label`、`role="alert"` 都有覆盖。
- **问题**：单一长表单无分组（B7）；圆角未跟进语义 token（B5）；提交按钮不是 sticky，移动端长表单需要滚到底部才能提交；没有分类专属字段和主图/排序（当前 schema 限制，非纯 UI 问题）。
- **最重要的三个改进**：`FormSection` 分组包装现有字段；提交按钮在移动端做 sticky bottom 处理（类似会话页输入栏的 `sticky bottom-0` + safe-area 模式，仓库里已有先例可以直接复用模式）；统一圆角/间距到 token。
- **是否适合直接重构**：适合做“分组包装”层面的重构（不改字段、不改提交逻辑）；不适合在本轮里扩展分类专属字段（涉及 schema，超出 UI 范围）。
- **涉及的共享组件**：`FormSection`（待建）、`PostImagePicker`（已存在）。

### 7. 消息列表页（`src/pages/messages/conversation-list-page.tsx`）

- **优点**：加载/错误/空状态齐全，文案清晰；每行是可点击的整卡片 `<Link>`，触达区域大。
- **问题**：没有头像、没有名称（只有“买家/卖家”角色标签）、没有最后一条消息预览、没有未读状态标记（B 节前“重要偏差”第 5 点）；卡片圆角/阴影（`rounded-lg` + `border`，无 `shadow-card`）与其他列表页不统一。
- **最重要的三个改进**：确认是否要新增头像/未读状态（涉及是否需要新的数据字段，需先确认范围）；至少统一卡片圆角/阴影到 token；补充“关联帖子”展示的视觉层级（目前和角色标签同一行纯文字堆叠）。
- **是否适合直接重构**：视觉层面的统一（圆角/阴影/间距）适合直接做；功能层面的头像/未读/预览需要先确认是否属于本次 UI 改造范围，因为这可能要求扩展查询字段。
- **涉及的共享组件**：无独立子组件。

### 8. 单个会话页（`src/pages/messages/conversation-page.tsx`）

- **优点**：这是全仓库里完成度最高、细节最讲究的页面——固定高度三段式布局（`grid-rows-[3.5rem_minmax(0,1fr)_auto]`）、消息气泡按发送方左右分布、时间分隔线逻辑（跨天/超过5分钟）、输入区域正确处理了 `env(safe-area-inset-bottom)`、返回按钮是 44×44 点击区域并带 `focus:ring-2`、空状态/加载/错误齐全、防止重复提交（`sendMessageMutation.isPending`）。
- **问题**：“更多”按钮（`⋯`）常驻禁用状态（`aria-label="更多会话选项（暂不可用）"`），是一个明确标注了“功能未完成”的占位 UI，长期保留会显得产品不完整；没有对方基本信息（头像用角色首字母代替，属于产品决定，非 bug）；没有发送状态的细粒度反馈（发送中只是禁用输入框，没有类似“已发送”的消息状态标记）。
- **最重要的三个改进**：决定“更多”按钮是隐藏还是保留占位（产品决策，不是纯 UI 问题）；可选：给消息增加发送中/失败的行内状态；其余保持现状即可，这是一个可以作为其他页面参照标准的页面。
- **是否适合直接重构**：**不需要大改**，可以作为批次 6 的样式基准（safe-area 处理、返回按钮点击区域可以直接抽出来复用到 `AppHeader`）。
- **涉及的共享组件**：可从这里反向抽出 `IconButton`（返回按钮）供 `AppHeader` 复用。

### 9. 我的页面（`src/pages/profile/profile-page.tsx`）

- **优点**：已经做到“区分业务入口和账号设置”的部分要求——用户资料卡（头像/昵称/邮箱）、业务入口分组（我的发布/我的收藏）、管理员入口独立分组并有小标题、退出登录视觉弱化为 outline 按钮放在最下方，层级已经是对的；每个 Settings 行都有统一的 `h-14` 高度和 `shadow-settings-item` token；页面背景色故意区分于全局背景（`bg-profile-page`），有注释说明设计意图。
- **问题**：没有“账号与安全”“帮助/协议”分组（重要偏差第 6 点，需求要求但当前不存在）；没有头像上传入口（注释里说明 v2 阶段没有这个功能，是产品范围决定）；chevron 用了硬编码色值 `text-[#999]`（应改为 token）。
- **最重要的三个改进**：补充“账号与安全”“帮助与协议”分组的入口占位（哪怕暂时链接到 404 或“开发中”提示，需先与产品确认是否要在本轮加）；把 `text-[#999]` 换成语义 token；评估是否要给"我的发布/我的收藏"加上数量徽标（当前无）。
- **是否适合直接重构**：这是全仓库里第二完成度高的页面，**不需要大改**，只需做小修补和补全缺失分组。
- **涉及的共享组件**：`settingsItemClassName` 目前是页面内的字符串常量，可以考虑抽成 `SettingsListItem` 组件供未来分组复用，但不是必须。

---

## E. 推荐改造优先级

**P0（先做，其余批次的基础）**

1. B1 统一帖子卡片（`PostCard`）——影响面最大，首页/分类页/收藏/我的发布都依赖它。
2. B2 修复 `FavoriteButton`/`ContactSellerButton` 无样式问题——全站最高频的两个交互元素。
3. 明确“重要偏差”第 1 点（shadcn/ui 是否要在批次 1 补装）——这是一个会影响后续所有批次实现方式的范围决策，必须先确认才能开始批次 1。

**P1（P0 完成后，或与 P0 并行但依赖 P0 的组件产出）**

4. B4 抽出共享 `SearchBar`。
5. B5 统一圆角 token 到所有页面（尤其表单类页面）。
6. B6 底部导航 safe-area 处理。
7. B7 发布页分组（`FormSection`）。
8. B10 抽出 `LoadingState`/`ErrorState`/`EmptyState`。
9. 批次 4 筛选系统（新建，依赖已确认的组件基础，如 Sheet/Dialog 模式，可参考 `my-posts-page.tsx` 现有的弹窗写法）。

**P2（锦上添花，不阻塞主线）**

10. B3 分页按钮样式（或整体改造为加载更多）。
11. B8 顶部栏返回按钮统一为 `IconButton`。
12. B9 帖子详情页操作区分层。
13. 消息列表页头像/未读/预览（需先确认是否扩展查询范围）。
14. 我的页面补充账号与安全/帮助协议分组。

**依赖关系**：P0 的第 3 项（shadcn 范围决策）必须先于批次 1 执行；`PostCard`（P0-1）应先于筛选系统（P1-9）和消息列表改造，因为筛选结果的展示、收藏列表的展示都依赖同一张卡片；`IconButton`（P2-11）如果提前在会话页抽出，可以反哺批次 2 的顶部栏/底部导航点击区域整改，建议把这一项从 P2 提到批次 2 里顺带做，不必等到最后。

---

## F. 建议拆分的实施批次

以下是在已给定的批次 1-7 框架上，结合本次审计发现补充的具体范围。

### 批次 0.5（新增，建议插入在批次 1 之前）：范围确认

- **修改目标**：不改代码，只需产品/工程确认三件事——(a) 是否在批次 1 里初始化 shadcn/ui（当前完全没有安装）；(b) 需求给出的目标色板（`primary: #246BCE` 等）是否要替换 `index.css` 现有色值（`#2563eb` 等），还是保留现有色值只补充缺口 token；(c) 字体栈是否要按需求新增 `@theme` 里的 `font-family` 设置。
- **可以修改的文件**：无（纯确认）。
- **禁止修改的文件或业务范围**：不适用。
- **验收标准**：三个问题均有明确书面结论。
- **应运行的检查命令**：无。

### 批次 1：建立设计系统

- **可以修改的文件**：`src/index.css`（更新/补充 `@theme` token）；如确认要接入 shadcn，新增 `components.json` 和 `src/components/ui/*`（新文件，不动现有文件）。
- **禁止修改的文件或业务范围**：`src/pages/**`、`src/features/**`、`src/repositories/**`、`src/services/**`、`src/router/**` 中的任何业务逻辑；不批量替换页面里的 Tailwind 类名（本批次只建立 token，不做页面级替换，页面替换放到对应批次）。
- **验收标准**：`npm run typecheck`、`npm run test`、`npm run build` 全部通过；`index.css` 里的 token 命名不破坏现有 `bg-primary`/`text-danger` 等已被页面引用的类名（否则会导致大范围视觉回归）。
- **应运行的检查命令**：`npm run typecheck && npm run test && npm run build`（`package.json` 第 7-11 行已定义好这三个 script）。

### 批次 2：全局框架和导航

- **可以修改的文件**：`src/components/app-shell.tsx`、`src/components/app-header.tsx`、`src/components/bottom-nav.tsx`；新增 `src/components/icon-button.tsx`（从会话页返回按钮模式抽取）。
- **禁止修改的文件或业务范围**：`src/router/routes.tsx` 的路由结构和 `RequireAuth`/`RequireAdmin` 逻辑；不改变 `AppShell` 判断“是否隐藏顶部栏/底部导航”的现有规则（`useMatch({ path: "/messages/:conversationId", end: true })`）。
- **验收标准**：按需求给定的 10 条逐条核对，其中“底部导航考虑 safe-area”对照 `conversation-page.tsx` 已有实现模式；44×44px 点击区域用返回按钮和底部导航项分别验证。
- **应运行的检查命令**：`npm run typecheck && npm run test && npm run build`。

### 批次 3：首页、列表和帖子卡片

- **可以修改的文件**：`src/pages/home/home-page.tsx`、`src/pages/category/category-page.tsx`、`src/features/posts/post-list.tsx`；新增 `src/features/posts/post-card.tsx`（从 `post-list.tsx` 抽出）、新增 `src/components/search-bar.tsx`。
- **禁止修改的文件或业务范围**：`src/features/posts/use-posts-query.ts` 的查询参数和 `src/repositories/posts-repository.ts`（除非批次 4 明确要求扩展筛选参数）；不改变瀑布流 `columns-2` 的技术方案，除非有明确理由。
- **验收标准**：按需求给定标准逐条核对；额外要求：`favorites-page.tsx` 和 `my-posts-page.tsx` 在本批次或紧随其后改为复用新的 `PostCard`，避免三套卡片继续并存。
- **应运行的检查命令**：`npm run typecheck && npm run test && npm run build`。

### 批次 4：筛选系统

- **前置确认**：由于当前完全没有筛选相关 UI 和查询参数，启动前需明确：是否需要扩展 `use-posts-query.ts` 的查询参数（这已经触碰“不修改查询逻辑”的全局安全要求边界，建议先由产品/工程明确“新增筛选维度”是否算在本次 UI 改造范围内，还是只做“UI 骨架 + 暂不生效”）。
- **可以修改的文件**：新增 `src/features/posts/filter-bar.tsx`、`filter-sheet.tsx`、`active-filters.tsx` 等；`src/pages/home/home-page.tsx`、`category-page.tsx` 接入筛选入口。
- **禁止修改的文件或业务范围**：`src/repositories/posts-repository.ts` 内部 SQL/RPC 逻辑；Supabase 相关一切。
- **验收标准**：按需求 10 条核对；额外要求：明确标注哪些筛选维度是“UI 已就绪但数据层未接入”，避免给用户呈现“选了筛选但没生效”的错觉。
- **应运行的检查命令**：`npm run typecheck && npm run test && npm run build`。

### 批次 5：发布页

- **可以修改的文件**：`src/pages/publish/publish-page.tsx`；新增 `src/components/form-section.tsx`。
- **禁止修改的文件或业务范围**：`src/pages/publish/publish-validation.ts`、`src/repositories/posts-repository.ts`、`src/repositories/post-images-repository.ts`、`src/services/storage/post-image-storage-service.ts`——这些是明确的业务/校验/存储逻辑，本批次只做字段分组和视觉包装。
- **验收标准**：按需求给定标准核对；额外要求：提交按钮的 sticky 处理需要验证在键盘弹出时不遮挡“分类/地区/标题”等靠前字段（可参考会话页 `sticky bottom-0` 模式）。
- **应运行的检查命令**：`npm run typecheck && npm run test && npm run build`。

### 批次 6：消息页和我的页面

- **可以修改的文件**：`src/pages/messages/conversation-list-page.tsx`、`src/pages/profile/profile-page.tsx`；`conversation-page.tsx` 原则上不需要大改（见 D8），仅做从中反向抽取 `IconButton` 相关的引用调整。
- **禁止修改的文件或业务范围**：`src/features/conversations/**`、`src/features/messages/**` 的查询逻辑；若消息列表页要新增头像/未读/预览字段，需先确认是否超出本批次的“纯 UI”范围（大概率需要新的查询字段，建议单独立项而非塞进本批次）。
- **验收标准**：按需求给定标准核对；我的页面需明确“账号与安全”“帮助协议”是新增占位入口还是本批次不做（若不做，需在报告里说明原因，不能默默省略）。
- **应运行的检查命令**：`npm run typecheck && npm run test && npm run build`。

### 批次 7：最终一致性和无障碍检查

- **可以修改的文件**：视前序批次遗留问题而定，原则上是小范围补丁（`aria-label`、`alt`、focus 样式等），不新增组件。
- **禁止修改的文件或业务范围**：所有业务逻辑文件。
- **验收标准**：按需求列出的检查清单逐条核对，建议按断点（320/375/430/平板/桌面）用浏览器 DevTools 实测而非仅靠代码审查。
- **应运行的检查命令**：`npm run typecheck && npm run test && npm run build`，并建议补充一次手动的 Lighthouse/axe 无障碍扫描（仓库目前没有自动化无障碍测试工具，需确认是否要在本批次引入）。

---

审计到此结束，未修改任何文件，等待下一步指令。
