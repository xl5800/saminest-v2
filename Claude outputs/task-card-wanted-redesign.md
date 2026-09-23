# 任务卡：求租板块改版（数据模型 + 首页流排除 + 求租列表页 + 发布表单）

> **对应 worktree**：`C:\Users\32092\Documents\Codex\saminest-v2-wanted-redesign`（分支 `feat/wanted-redesign`）——四张任务卡里最先做的一张，做完合并进 `main` 之后再建"帖子分类占位改版"那张卡的 worktree（两张卡都改 `post-list.tsx`，顺序做才不会撞出合并冲突，见对话里的讨论）。

> 编号留空——我不确定当前项目里"X 号卡"的编号已经排到多少了（代码注释里最新能看到的是"30 号卡"，跟我这次会话里用的"8 号卡/9 号卡"不是同一套连续编号），你确认好编号之后，麻烦在这份文档标题、以及要求 Codex 在代码注释里写的地方，统一替换成正确的编号。

## 背景

求租类帖子（分类 slug = `wanted`，见 `20260715220100_create_categories_table.sql`）目前跟"租房/二手"共用同一套图片网格卡片、同一套详情页字段展示，跟首页"推荐"混在一起。经过讨论（对照 SpareRoom 的 Room Wanted、Craigslist housing wanted、豆瓣求租帖等同类产品），这次改版要做四件事：

1. 求租帖子**不再出现在首页"推荐"混合流**里，只在求租自己的分类 Tab 下展示。
2. 求租 Tab 下的帖子列表从"两列图片网格"换成"单列纯文字卡片"。
3. 求租的预览卡片 / 详情页展示的字段做精简，只保留讨论后确认的这几项。
4. 发布表单在选中"求租"分类时，额外出现"性别""年龄"两个字段，年龄默认从个人资料的 `age` 带出来、可以在发帖时修改。

**明确不做的事**（之前讨论过、这次不在范围内，不要顺手加）：筛选栏（布鲁克林▾/租金▾/筛选▾这类）、详情页的地图缩略图、详情页的电话拨打按钮、"是否带宠物""工作情况"这两个字段（讨论后决定不做，不要因为看到设计稿草图里出现过就加回来）。

## 一、数据库迁移

新建一个迁移文件（文件名按当前日期时间，格式照抄现有迁移的 `YYYYMMDDHHMMSS_描述.sql`，排在 `20260903050000_add_profile_age.sql` 之后）：

- `posts` 表新增两列：
  - `poster_age smallint null default null` —— 约束 `poster_age is null or (poster_age >= 13 and poster_age <= 120)`，跟 `profiles.age`（见 `20260903050000_add_profile_age.sql`）取值范围完全一致，理由也一样（挡脏数据，不是编码具体产品/法律政策）。
  - `poster_gender text null default null` —— 约束 `poster_gender is null or poster_gender in ('男', '女', '不透露')`。
- 两列都是**全表通用的可空列**，不是只有 `wanted` 分类的帖子才有这两列——跟 `price_amount`/`contact_method` 这些字段是同一个模式（列本身对所有分类通用，只是非求租分类的帖子这两列永远是 null，由应用层的表单决定什么时候真正写入值，不靠数据库层面的分类专属约束）。
- 命名解释放进迁移文件的注释里：叫 `poster_age`/`poster_gender` 而不是直接叫 `age`/`gender`，是为了和"发帖人自己的年龄/性别"这个语义对齐，避免以后如果这张表出现别的年龄类字段（比如"对室友年龄的要求"）时命名混淆。
- 不需要新的 RLS 策略——`posts_select_public_or_own_or_admin`（SELECT）和 `posts_update_own_or_admin`（UPDATE）都是按整行授权，新增列自动落在这两条策略的覆盖范围内，跟 `profiles.age` 那次迁移的结论一样。
- 照抄 `20260903050000_add_profile_age.sql` 的注释风格：为什么改、影响哪些表、取值范围为什么这么定、权限、是否影响现有数据（新增列默认 null，不影响任何现有行）、回滚方案（文件末尾注释，默认不执行）。

**预算/价格不需要新字段**——`posts` 表已经有 `price_amount`/`price_label`，求租的"预算"直接复用这两个现成字段（发布表单已有的"价格（可选）"输入框不用动），详情页/列表页展示时复用已有的 `isPriceUnset`/`formatPrice`（`src/utils/format.ts`）这一套"没有价格就整行不渲染"的逻辑，不要另外发明一个"预算区间"的新字段——这是讨论后特意确认的简化。

**"州"也不需要新字段**——求租帖子要展示的"想要的房子的州"，直接复用 `posts.location_id`/`location_text`（`resolveLocationName`，见 `posts-repository.ts`）这套现成的地区字段，发布表单已有的"地区"整页选择器不用动。

## 二、首页"推荐"流排除求租帖子

只有首页**没有选中任何具体分类**（即"推荐"这个 Tab，`activeCategorySlug` 是 `undefined`）的时候，才需要把 `wanted` 分类的帖子排除掉；用户主动点进"求租"这个 Tab 时（`activeCategorySlug === "wanted"`），要正常看到全部求租帖子，这两者不能共用同一个"排除"开关误伤。

其它列出帖子的地方（"我的收藏""我的发布"、发帖者主页"发布的作品"网格）**不要**加这个排除逻辑——那些是用户自己主动要看某个人/某个收藏夹的全部内容，不是"推荐"这种混合发现流，求租帖子该出现在那些地方，不用特殊处理。

具体改法：

- `src/repositories/posts-repository.ts`：`ListApprovedPostsInput` 新增可选字段 `excludeCategoryId?: string`；`listApprovedPosts` 里，只有 `categoryId` 没传（说明这是"推荐"这种未筛选场景）且 `excludeCategoryId` 有值时，才追加 `query = query.neq("category_id", excludeCategoryId)`。`categoryId` 有值时完全忽略 `excludeCategoryId`（两个条件天然不会同时需要）。
- `src/features/posts/use-posts-query.ts`：`UsePostsInfiniteQueryInput` 同样加 `excludeCategoryId?: string`，透传给 `listApprovedPosts`，并且要带进 `queryKey`（跟 `categoryId`/`stateCode`/`authorId` 现在的处理方式一样，缺一个都会导致缓存 key 冲突）。
- `src/features/posts/post-list.tsx`：`PostListProps` 加 `excludeCategoryId?: string`，透传给 `usePostsInfiniteQuery`。
- `src/pages/home/home-page.tsx`：从已经查出来的 `categories` 里找到 `slug === "wanted"` 那一条的 `id`（跟现在找 `activeCategoryId` 是同一个 `categories.find(...)` 模式），只在 `activeCategorySlug` 为空时把这个 id 传给 `PostList` 的 `excludeCategoryId`；`activeCategorySlug` 有值（不管是不是 `wanted` 本身）时都不传。

## 三、求租 Tab 的文字列表卡片

`post-list.tsx` 目前对所有分类统一渲染"两列图片网格"（`grid grid-cols-2`，见文件里 19 号卡改版那段注释）。这次要让求租 Tab 下改成单列纯文字卡片，其它分类的网格布局完全不变。

- `PostListProps` 新增 `variant?: "grid" | "wanted"`，默认 `"grid"`（不传时行为完全不变，租房/二手/推荐三个 Tab 都不用改调用点）。
- `home-page.tsx` 调用 `PostList` 时传 `variant={activeCategorySlug === "wanted" ? "wanted" : "grid"}`。
- `variant === "wanted"` 时，`post-list.tsx` 内部渲染路径整个换掉（不是在现有 `.map()` 里加 if/else 判断每张卡片，是外层直接分两套 JSX——两种布局的容器结构本来就不一样，`grid grid-cols-2` 硬塞两种卡片形状会很别扭）：
  - 不再是 `grid grid-cols-2`，改成 `flex flex-col gap-3 px-4`（单列纵向堆叠，横向 padding 跟现有网格保持一致的 `px-4`/`gap-3`）。
  - 每张卡片：`rounded-2xl bg-card shadow-card p-4`（`shadow-card` token 见 `DESIGN.md`——这是目前"两列网格"卡片本身没用到的投影，但求租卡片是纯文字、没有图片撑视觉重量，需要这一圈轻投影让卡片在 `bg-bg` 画布上"浮"出来，不是照抄网格卡片的无投影风格）。
  - 卡片内容，按讨论确认的顺序：
    1. **标题**：`text-base font-medium text-text`，可以两行截断（`line-clamp-2`），不用像网格卡片那样单行截断——文字卡片有更多横向空间，没必要为了省一行牺牲标题完整度。
    2. **价格**（若 `isPriceUnset` 命中就整行不渲染，逻辑照抄 `post-detail-page.tsx`/网格卡片现在的判断）：`text-lg font-semibold text-text`（价格用黑色，不用强调蓝，跟全站"价格永远黑色"的约定一致，`DESIGN.md` 里写得很清楚）。
    3. **州**（`locationName`，若为 `null` 就整行不渲染，不展示"地区未填写"这种占位文案——求租帖子发布时"地区"字段理论上应该是必填或者强引导填写的，具体要不要在校验层面强制见下面第四节的开放问题）：`text-sm text-text-muted`，前面配一个 `MapPin`（lucide-react，跟 `post-detail-page.tsx` 用的是同一个图标）。
    4. **发帖人信息行**：小圆形头像（24px，`h-6 w-6 rounded-full`；没有头像时的兜底样式照抄 `person-card.tsx` 的 `bg-primary/10 text-primary` 首字母圆圈，只是尺寸从 40px 缩小到 24px，字号相应缩小到 `text-[10px]`）+ 昵称（`text-sm text-text`）+ 性别/年龄（`text-sm text-text-subtle`，两者都缺失时这一段直接不渲染，只缺一个就只展示那一个，不展示"未填写"占位——照抄 `activity-detail-page.tsx` 里 `formatJoinedParticipantLine` 那个"能拼多少拼多少、缺的直接跳过"的模式，这次新写一个类似的小函数，比如 `formatWantedPosterMeta(gender, age)`，放在 `src/utils/format.ts` 里跟其它格式化函数放在一起）。

  **不要**在这张卡片上加"求租"分类标签 chip、发布时间——这两项这次讨论时明确没有列进要展示的字段里（分类标签在这个 Tab 下本来就是多余信息，整个 Tab 只有求租帖子；发布时间列表本身按 `created_at` 降序排列，不需要在卡片上重复标出来）。

- `PostFeedItem`（`posts-repository.ts`）需要新增字段才能喂给这张卡片：
  - `authorAvatarUrl: string | null`（目前 `PostFeedItem`/`listApprovedPosts` 完全没有查这一列，`getPostDetail` 那边已经在查 `author:profiles(display_name, avatar_url)`，`listApprovedPosts` 的 select 需要照样把 `avatar_url` 加进 `author:profiles(...)` 这个嵌套 select 里）。
  - `posterAge: number | null`、`posterGender: string | null`（新增列，`listApprovedPosts` 的 select 里加 `poster_age, poster_gender`，映射进返回对象）。
  - 这两个字段加在 `PostFeedItem` 上（不是 `PostListItem`）——`PostListItem` 是收藏列表页复用的更窄的类型，求租卡片这套新字段收藏列表页用不上，不要为了这次改动牵连一个不相关的页面，见文件里 `PostFeedItem`/`PostListItem` 拆开的那段既有注释，这次延续同一个原则。

## 四、发布表单新增"性别""年龄"

`src/pages/publish/publish-page.tsx` 目前是一张对所有分类通用的表单，这次要让"性别""年龄"这两个字段只在选中"求租"分类时出现。

- 从已经查出来的 `categories` 按 `categoryId` 反查 `slug`（`categories?.find((c) => c.id === categoryId)?.slug`），判断是不是 `"wanted"`，只在是的时候渲染这两个新字段（放在"地区"字段下面、"标题"字段上面比较合适，紧跟着"这个人是谁"这类信息；具体放哪个位置你可以按视觉习惯调整，不是强制要求）。
- **年龄**：`type="number"`，UI 和校验规则照抄 `edit-profile-page.tsx`/`edit-profile-validation.ts` 里年龄字段的现成实现（13~120，可选不强制）——不要重新发明一套。
- **性别**：三个选项的单选（男/女/不透露），UI 形式（原生 `<select>` 还是几个 chip 按钮）跟表单里"联系方式类型"那个 `<select>` 保持同一种控件风格即可，不需要引入新的选择器组件。
- **年龄自动带出个人资料**：新建帖子（非编辑模式）、且用户选中"求租"分类时，用 `useMyProfileQuery()`（`src/features/profile/use-my-profile-query.ts`，跟 `edit-profile-page.tsx` 是同一个 hook）读当前登录用户的 `profile.age`，只在年龄输入框还没被自动填过、且用户还没手动改过的情况下，把这个值当作初始值填进去（用一个新的 `useRef` 挡住重复自动填充，模式照抄这个文件里 `seededRef`/`presetSeededRef` 那一套"只做一次"的写法）；用户之后手动改这个输入框，改的是这条帖子自己的 `poster_age`，不会写回 `profiles.age`，两者从这一刻起是独立的两份数据（跟"标题/描述这些字段各自独立，不是引用"是同一个道理）。
- **编辑模式**：`existingPost`（`PostDetail`）需要新增 `posterAge`/`posterGender` 字段（`getPostDetail` 的 select 里加 `poster_age, poster_gender`），编辑一条已有的求租帖子时，这两个字段从帖子自己的数据回填，不从 `profiles.age` 重新带（帖子已经有自己保存过的值，不应该被资料页此后可能已经变化的年龄覆盖）。
- **提交**：`CreatePostInput`/`UpdatePostInput`（`posts-repository.ts`）新增 `posterAge: number | null`、`posterGender: string | null`，`createPost`/`updatePost` 里映射进 `poster_age`/`poster_gender` 两列；`publish-validation.ts` 的 `validatePublishInput` 新增这两个字段的校验（范围/枚举值，规则跟迁移里的 CHECK 约束保持一致，理由跟 `edit-profile-validation.ts` 顶部注释里"前端校验必须跟数据库 CHECK 约束用同一个区间"完全一样）。非求租分类提交时这两个字段应该传 `null`（表单不渲染这两个输入框，对应的 state 也不应该被带进提交 payload）。

**一个需要你确认的小决定**：这两个字段是"可选"还是"求租分类下必填"？我这次按"可选、不强制"来写（跟 `profiles.age`/价格的可选逻辑一致），如果你想让求租分类下这两项变成必填（比如不填年龄就不让发布），跟我说一声，我再补一版校验规则和错误提示文案。

## 五、详情页

`src/pages/post/post-detail-page.tsx` 目前的顺序本来就是"标题 → 价格（若有）→ 地区 → 分享/收藏/举报 → 联系方式（若有）→ 描述 → 发帖人卡片"——这跟这次讨论确认的"标题 → 州 → 求租说明"顺序其实是同一套结构（州就是现有的"地区"那一行，求租说明就是现有的"描述"段落），**不需要为求租分类单独改这个页面**，现有通用详情页已经满足要求。

明确不加的东西：不在详情页重复展示性别/年龄（已经在预览卡片上展示过，详情页保持现有的发帖人卡片——头像+昵称+发布时间，不重复放性别年龄）；不加"户型要求/入住人数/期望入住时间/租期"这类结构化信息卡片（讨论后确定不做，全部收进"求租说明"这段自由文本里，由发帖人自己描述）。

## 验收标准

- 首页"推荐" Tab（未选中分类）看不到任何求租分类的帖子；点进"求租" Tab 能正常看到全部求租帖子；"我的收藏""我的发布"、发帖者主页仍然正常展示求租帖子（未受影响）。
- "求租" Tab 下的帖子卡片是单列纯文字卡片（标题/价格若有/州若有/头像+昵称+性别年龄），不再展示图片占位框；其它三个 Tab（推荐/租房/二手）的两列图片网格外观、行为完全不变。
- 求租详情页顺序保持现状（标题→价格→州→……→描述→发帖人卡片），不需要新增改动就应该已经满足。
- 发布表单选中"求租"分类时出现"性别""年龄"两个字段，切到其它分类时这两个字段消失；新建求租帖子时年龄默认带出个人资料的年龄、可以手动改；编辑一条已有求租帖子时年龄/性别从帖子自己的数据回填，不从个人资料重新带。
- `npm run typecheck && npm run test && npm run build` 全部通过；新迁移文件在本地/预发 Supabase 项目上能正常 `apply`，不影响任何现有数据（新增列默认 null）。
