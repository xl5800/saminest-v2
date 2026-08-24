# Saminest 用户内容（UGC）安全功能审查 — 苹果 App Store 1.2 条款合规检查

审查日期：2026-08-22
审查范围：`saminest-v2` 仓库源码 + 数据库迁移（`supabase/migrations`），对照苹果 App Store 审核指南
**Guideline 1.2 Safety – User Generated Content**。该条款要求任何带 UGC（发帖、评论、聊天、活动等）
的 App 必须同时具备：① 过滤/审核机制、② 举报机制、③ 屏蔽（block）滥用用户的机制、④ 公开的联系方式、
⑤ 对违规用户采取行动（封禁/移除）的机制。Saminest 用 Codemagic + Capacitor 打包成原生壳提交审核，
审核员会被当作 UGC App 审查，不会因为底层是 Web 技术而豁免这五条。

## 一、结论摘要

| 你列出的功能 | 当前状态 | 说明 |
|---|---|---|
| 举报帖子 | ✅ 已实现 | `report-post-page.tsx`，走 `reports` 表，管理员可在后台处理 |
| 举报评论 | ✅ 已实现 | `comment-item.tsx` 内嵌举报表单，`reports.target_type` 已放开到 `comment` |
| 举报活动 | ✅ 已实现 | `report-activity-page.tsx`，`reports.target_type` 已放开到 `activity` |
| 举报用户 | ❌ **未实现** | 代码里有明确注释承认"这个仓库目前没有'举报用户'这个功能"；数据库 `reports_target_type_check` 约束也没有 `user` 这个取值 |
| 屏蔽用户 | ❌ **未实现** | 全仓库搜索不到任何用户对用户的拉黑/屏蔽逻辑，只有管理员对账号的封禁/限权 |
| 管理员删除违规内容 | ⚠️ **只覆盖帖子** | 管理员能删帖（`delete_post`）、能处理举报（`resolve_report`/`dismiss_report`）、能封禁/限权账号（`set_account_status`），但**没有任何后台入口能删除违规评论或下架违规活动** |

其中"举报用户"和"屏蔽用户"是**必须补的硬缺口**——Saminest 有帖子作者联系、活动组织者联系、任意用户主页
"发消息"三个 1 对 1 私信入口（`contact-seller-button.tsx` / `use-create-profile-conversation-mutation.ts`），
审核员测试这类带私信功能的 App 时，几乎一定会尝试"在聊天里屏蔽/举报对方"，找不到入口是 1.2 条款最常见的
拒绝理由之一，这条比另外两条更容易导致直接被拒。

## 二、已实现部分：现状与需要补的小问题

### 举报帖子 / 评论 / 活动（三者共用 `reports` 表）

- 举报原因覆盖诈骗、垃圾信息、重复发布、违规内容、虚假信息、骚扰、隐私、其他 8 类（`REPORT_REASON_OPTIONS`），覆盖面合理。
- 有防重复提交（同一用户对同一目标未处理完的举报最多一条，数据库唯一索引保证）。
- 管理员后台 `/admin/reports` 能按状态筛选、标记已处理/驳回，处理时必须填写处理说明，全部操作记录到 `moderation_actions` 审计日志——这部分做得比很多同类项目扎实。

需要补的问题：

1. **举报评论/活动后，管理员在举报列表里点不到"同时删除"** —— `reports-page.tsx` 第 351 行那个"同时删除该帖子"复选框，判断条件是 `report.targetType === "post"`，对 `comment`/`activity` 类型的举报完全不显示。管理员想删掉一条被举报的违规评论或下架一个违规活动，现在**只能标记举报"已处理"，但实际违规内容还留在平台上**——这正是苹果 1.2 条款"有能力移除违规内容"要检查的点，目前对评论和活动是缺失的。
2. 举报列表里，`targetType === "comment"` 的行不显示可点击链接（只显示 `comment / <id>`），管理员没法直接跳转去看这条评论的上下文，处理效率低，建议至少显示所属帖子链接。

### 管理员账号管理（`/admin/users`）

- 支持设为受限（restricted）/封禁（suspended）/恢复正常，操作必填原因、记审计日志、管理员不能操作自己，这部分覆盖了苹果 1.2"对违规用户采取行动"的要求。

## 三、必须补的功能一：举报用户

### 为什么必须做

苹果 1.2 明确要求"a mechanism for users to flag/report objectionable content **and abusive users**"。
你现在能举报的是"内容"（帖子/评论/活动），但用户主页（`user-profile-page.tsx`）本身没有举报入口——代码里
的注释也印证了这是产品有意识跳过、不是遗漏：

> "这个仓库目前没有'举报用户'这个功能（只有举报活动/举报帖子），先不在菜单里放一个点了会 404 的空壳入口"

### 建议实现方式（复用现有 `reports` 基础设施，改动量不大）

1. **数据库**：新增一份迁移，把 `reports_target_type_check` 从 `('post','comment','activity')` 放宽到加入 `'user'`，`target_id` 存被举报用户的 `profiles.id`。`reports_reporter_active_target_unique_idx`、RLS 策略（`reports_insert_own`/`reports_select_own`）都是按 `(target_type, target_id)` 通用设计的，不需要改。
2. **前端入口**：在 `user-profile-page.tsx` 的 `TopBar` 传入 `moreMenu`，加一个"举报用户"选项，跳转到新的 `/users/:userId/report` 路由——可以直接复制 `report-activity-page.tsx` 的结构（表单、`REPORT_REASON_OPTIONS`、错误处理全部复用），把 `targetType` 换成 `"user"` 即可，工作量很小。
3. **管理后台**：`reports-page.tsx` 里 `targetType === "user"` 的举报，链接指向 `/admin/users` 并高亮该用户（或者直接在这一行加"查看该用户"跳转 + 复用已有的 `设为受限/设为封禁` 按钮），把"举报用户"和已有的账号管理功能打通。

## 四、必须补的功能二：屏蔽用户

### 为什么这是最容易导致拒审的一条

Saminest 有三处允许任意用户之间发起私聊：帖子"联系卖家"、活动"联系发起人/参与者"、用户主页"发消息"。
只要 App 有用户间私信，苹果审核指南里"block abusive users"这条**几乎总是被解读成需要一个用户可以自主操作
的"屏蔽/拉黑"按钮**，而不只是后台管理员封号——管理员封号是平台侧的最终手段，普通用户被骚扰时不可能也不
应该等着找客服，需要能自己立刻屏蔽对方。目前 Saminest 完全没有这个能力：账号管理页的"设为受限/封禁"只有
管理员能操作，普通用户之间没有任何互相屏蔽的入口。

### 建议的最小可行实现

1. **新表 `user_blocks`**：`blocker_id`、`blocked_id`（都指向 `profiles.id`）、`created_at`，加 `(blocker_id, blocked_id)` 唯一约束防重复屏蔽，RLS 只允许用户管理自己发起的屏蔽记录（`blocker_id = auth.uid()`）。
2. **屏蔽后至少要生效在两个地方**（这是审核员会实测的最小闭环，不用一开始做到"帖子列表也隐藏对方发布内容"这种更大范围的过滤）：
   - **私信**：`create_direct_conversation`/`create_profile_conversation`/`create_activity_conversation` 这几个 security definer 函数里加一条检查——任一方向存在屏蔽记录就拒绝建会话；已有会话里双方也不能再互发消息（在 `messages` 的插入策略里加同样的检查）。
   - **用户主页**：`user-profile-page.tsx` 加"屏蔽此人"按钮（放在"发消息"按钮旁边，未登录/查看自己主页时不显示，跟现有的 `isOwnProfile` 判断逻辑一致）；已屏蔽的用户按钮变成"取消屏蔽"。
3. 入口建议同时放在会话详情页（`conversation-page.tsx`）顶部菜单，被骚扰的用户通常是在聊天界面里当场想屏蔽对方，而不是先跳转去对方主页——这也是苹果审核员最常见的测试路径。
4. 一个"我屏蔽的人"管理列表（在个人资料页下加一项）不是苹果强制要求的，但做了体验更完整，优先级可以放低，先把"能屏蔽 + 屏蔽后收不到消息"这个闭环做出来。

## 五、必须补的功能三：管理员删除违规评论 / 下架违规活动

目前 `admin-repository.ts` 里只有 `deletePost` 一个内容删除函数，对应数据库 `delete_post` security definer
函数（软删除 + 记审计日志）。评论和活动被举报后，管理员在后台**没有任何按钮能真正移除它们**，只能标记举报
"已处理"——但违规内容还在，等于举报机制走了个过场。这条和"举报用户/屏蔽用户"同样重要，因为苹果 1.2 明确要求
"the ability to remove the objectionable content"，覆盖的是**全部**用户生成内容类型，不是只有帖子。

建议：

1. 仿照 `delete_post` 的模式，新增两个 security definer 函数：
   - `delete_comment(target_comment_id uuid, delete_reason text)`：管理员权限校验 + `is_admin()`，对 `comments.deleted_at` 做软删除（复用现有软删除机制，前端已经会把 `isDeleted` 的评论渲染成"该评论已删除"占位），记 `moderation_actions`。
   - 活动这边看你们对"下架"的产品定义：如果等同于组织者取消（`activities.status` 走 `cancelled`），可以加一个 `admin_cancel_activity(target_activity_id uuid, cancel_reason text)`，逻辑参考现有 `cancelActivity`，但去掉"只有发起人自己能取消"的限制，改成 `is_admin()`。
2. `admin-repository.ts` 里补上对应的 `deleteComment` / `adminCancelActivity` 包装函数。
3. `reports-page.tsx` 里把"同时删除"复选框的显示条件从 `report.targetType === "post"` 扩展成三种类型都显示，按类型调用不同的删除函数——现有的"处理举报成功但删除失败"的降级提示逻辑（`PARTIAL_DELETE_FAILURE_MESSAGE`）可以直接复用，不需要重新设计这部分状态处理。

## 六、举报评论时，管理员在后台看不到评论内容——设计方案（含业界参考）

### 现状问题

`reports-page.tsx` 第 296 行，`target_type` 不是 `post`/`activity` 时（也就是 `comment`），直接
渲染成一行纯文本 `comment / <id>`，管理员**无法在不跳出这个页面的情况下看到举报的到底是哪句话**、
谁说的、在哪个帖子下面说的。实际上现在也没有任何页面能让管理员单独查看一条评论——评论只在帖子详情页
的评论区里跟着帖子一起渲染，没有独立路由。这不只是体验问题：管理员现在处理一条"评论骚扰/违规内容"的
举报，唯一的办法是拿着 `target_id`（一个 UUID）自己去数据库后台查，普通管理员日常操作根本做不到。

而且这个问题背后还有一个更深的技术坑：`comments_select_of_approved_or_own_posts` 这条 RLS 策略
（`20260804000000_create_comments_table.sql`）只放行"评论所属帖子已审核公开"或"帖子作者本人"两种情况，
**没有 `is_admin()` 例外**——这跟你们自己在 `post_images` 表上踩过、并且已经记在技术债里的坑是同一类问题。
也就是说，就算以后给 `reports-page.tsx` 加了"显示评论内容"的 UI，只要被举报评论所属的帖子当时状态不是
"已审核公开"（比如帖子已经被举报同时下架、或者还在待审核），管理员这次连数据库这一层都查不到这条评论，
不是前端没做，是后端权限本身就挡住了。

### 业界怎么设计这块

参考了几家做审核队列的产品，共同点很一致：**举报队列里必须直接展示被举报内容本身，不能只给一个 ID 或链接
让审核员自己去找。**

- **Reddit 的 Moderation Queue** 明确把这一点当成核心设计：审核员可以在"经典视图"或"卡片视图"里直接看到
  被举报的帖子/评论原文，"举报原因就显示在这条内容正下方"（review report reasons directly below the
  post or comment），审核员不需要跳转就能在同一行里点"通过 / 删除 / 标记垃圾内容 / 忽略举报"，多条还能
  批量处理。([Reddit Mods 帮助中心](https://mods.reddithelp.com/hc/en-us/articles/360010090132-Moderation-Queue))
- 通用的审核平台（如 GetStream 的 Moderation Dashboard）也是把"实体内容本身"作为审核队列条目的核心字段
  之一跟举报元数据一起返回，而不是只给一个引用 ID。([GetStream Moderation 文档](https://getstream.io/moderation/docs/dashboard/reviewing-content/))

这跟你们已经给"举报帖子"做的处理是同一个思路的自然延伸——`AdminReportListItem.targetTitle` 已经在做
"批量把 post/activity 的标题查出来直接显示在举报行里"这件事（`fetchTargetTitles`），只是这个函数目前显式
跳过了 `comment` 类型（"comment...直接跳过，不去查任何表"），现在要做的是把这个已经验证过的模式补全到
评论上，不是引入新模式。

### 建议的具体设计

1. **后端 RLS**：给 `comments_select_of_approved_or_own_posts` 加一条 `or public.is_admin()` 分支
   （drop + recreate 这条策略），管理员对任意评论都有只读权限，不受所属帖子当前状态影响——跟已经记在
   技术债里的 `post_images` 那条修法完全一致，可以照抄同一个模式，工作量很小。

2. **要不要做"举报时的内容快照"（防止用户删评论逃避处罚）**：调研了一圈，不少大平台（Reddit/Meta 等）
   会在举报提交那一刻存一份内容快照，因为它们的评论支持真删除或编辑，用户可能会在审核员处理之前把证据
   抹掉。**Saminest 不需要这么做**——你们的评论本来就是软删除（`deleted_at`），也没有编辑功能，用户点
   "删除"之后 `content` 字段原文原样留在数据库里，只是前端把它渲染成"该评论已删除"占位。只要第 1 步的
   RLS 例外加上，管理员随时能查到原文，不管这条评论有没有被用户自己"删除"过——用软删除机制本身就天然
   达到了别的平台需要额外做快照表才能达到的效果，不需要多建一张表、多一次写入。（如果未来给评论加了真删除
   或编辑功能，这条判断需要重新评估，到时候再补快照机制。）

3. **`reports-repository.ts`**：把 `fetchTargetTitles` 现在"comment 类型直接跳过"的分支，改成批量查询：

   ```
   comments 表 select id, content, deleted_at, post_id, author:profiles(display_name), post:posts(title)
     .in("id", commentIds)
   ```

   `AdminReportListItem` 新增一个可选字段，比如 `commentPreview`，包含评论原文、是否已被用户软删除、
   作者昵称、所属帖子标题和 id——这样 `listReportsForModeration` 一次查询就能把评论审核所需的全部上下文
   带出来，不需要为"查看单条评论"另外做一个页面或接口。

4. **`reports-page.tsx` UI**：`target_type === "comment"` 的行，不再显示 `comment / <id>` 这种纯文本，
   改成：

   - 引用样式展示评论原文（比如带左边框的 blockquote），如果 `deleted_at` 不为空，加一个"该评论已被
     用户删除"的小标签——**但仍然展示原文**，这是审核的关键：用户删评论不代表这条举报可以不处理，管理员
     需要看到原始内容才能判断是否需要顺带处置这个账号。
   - 评论作者昵称 + 所属帖子标题（可点击链接到 `/post/:postId`，复用 `report.targetType === "post"`
     分支已有的 `<Link>` 写法）。
   - 复用第五节已经建议的 `delete_comment` 后台函数：把"同时删除该帖子"复选框的显示条件从
     `report.targetType === "post"` 扩展到 `"post" | "comment"`，评论类型时改调 `deleteComment`。

这样一次改动同时解决了"看不到内容"和"看到了也删不掉"两个问题，因为它们本来就是同一个功能缺口的两半——
建议合并成一个开发任务一起做，不要拆成两次分别上线。

## 七、其他已确认没有问题的项

- **公开联系方式**：`terms-page.tsx`/`privacy-page.tsx` 的"联系我们"一节都指向站内"联系客服（Feedback）"页面（`/feedback`），能实际提交给平台方，满足苹果对"published contact information"的要求，不需要改动。
- **服务条款**：已写明平台有权审核、删除内容、限制/封禁账号，无需提前通知，覆盖了"zero-tolerance"精神。
- **账号处置**：受限/封禁两级 + 必填原因 + 审计日志，已经是一套可用的账号侧执法机制。

## 八、优先级建议

1. **P0（提审前必须做）**：屏蔽用户（第四节）、举报用户（第三节）——这两条是苹果 1.2 条款字面要求的功能，私信场景下审核员大概率会主动测试。
2. **P0（提审前必须做）**：管理员能看到被举报评论的原文、能删除违规评论、能下架违规活动（第五、六节，建议合并成一个任务一起做）——否则"评论举报"这条现有功能连管理员自己都没法处理，审核员追问"举报之后你们怎么处理"时经不起推敲。
3. **P1（建议在 P0 之后补，不阻断提审）**："我屏蔽的人"管理列表。

如果时间紧张只能先做一部分，优先级排序是：**屏蔽用户 > 举报用户 > 管理员删评论/下架活动**——因为屏蔽用户
直接关系到私信场景下的用户安全，是苹果审核里被明确写进指南原文的能力，也是最容易在人工测试中被直接摸到的
缺口。
