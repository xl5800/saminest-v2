# Codex 任务卡 — UGC 安全功能补齐（举报用户 / 屏蔽用户 / 管理员内容处置）

- 对应报告：`docs/04_Development/Apple-UGC-Compliance-Review.md`（背景、苹果 1.2 条款依据、业界参考都在那份文档里，这里不重复）
- 任务卡格式沿用本仓库 `docs/04_Development/AI-Development.md` 第 27 节"AI 任务模板"，可以直接整段复制给 Codex
- 四张卡按优先级从高到低排列，建议分四个独立分支跑，不要合并成一个任务——每张卡都符合
  `AI-Development.md` 2.3/4.1 节"单任务单目标、渐进式开发"的要求
- 每张卡里标了「已核实」和「需要 Codex 自己先读代码确认」两种信息：前者是这次审查已经打开对应
  迁移文件核对过的（函数名、策略名、参数都对得上当前代码），后者是设计意图明确但具体实现需要
  Codex 先读一遍现有代码再动手的部分——不要把「需要确认」的部分当成已经写死的方案直接抄

---

## 任务卡 1（P0）：屏蔽用户

```text
请在当前 Saminest 仓库中完成以下任务。

目标：
让登录用户可以屏蔽任意其他用户；屏蔽生效后，双方都不能再互相发起新的私信会话，
已有会话里也不能再互相发消息。屏蔽是单向的（我屏蔽你，不代表你屏蔽我），检查
"是否存在屏蔽关系"时按无方向匹配（任一方向存在记录就拦截）。

背景（已核实的现状）：
- 项目里已经有三个会话创建入口，全部是 security definer 函数：
  create_direct_conversation(target_post_id)（帖子联系卖家）、
  create_profile_conversation(target_user_id)（用户主页发消息）、
  create_activity_conversation(...)（活动联系发起人/参与者，具体参数需要
  你自己打开 supabase/migrations/20260815182042_create_activity_conversation_function.sql
  确认）。三个函数目前都没有任何"双方是否互相拉黑"的检查。
- create_profile_conversation 现有检查链条（supabase/migrations/
  20260818070309_create_profile_conversation_function.sql）依次是：未登录 →
  账号受限 → 目标用户不存在 → 不能给自己发消息 → 每日新建会话限流。新的
  屏蔽检查应该加在"不能给自己发消息"之后、限流判断之前，用同样的
  `raise exception '...'` 风格。
- messages 表的 messages_insert_own_as_active_member 这条 INSERT 策略
  （supabase/migrations/20260716000400_create_messaging_tables.sql）目前
  只检查 sender_id = auth.uid() 且发送者仍是该会话的 active member（
  cm.left_at is null），完全没有检查会话对方是否已经把发送者拉黑——这条
  策略也需要补屏蔽检查，否则已经建立的会话在一方屏蔽另一方之后仍然能继续
  发消息。这条策略具体怎么改（比如要不要新增一个 SECURITY DEFINER 辅助
  函数去查"这条会话里除了我之外的其他 active member 有没有跟我互相屏蔽"，
  避免直接在 RLS 里写自引用/递归查询导致踩到这个仓库已经在 comments/
  conversation_members 表上踩过两次的 RLS 无限递归坑），需要你先读一遍
  conversation_members / messages 现有结构再决定实现方式，不要照抄一个
  没验证过的写法。

允许修改：
- 新建 supabase/migrations/<timestamp>_create_user_blocks_table.sql
- 新建 supabase/migrations/<timestamp>_enforce_user_blocks_in_messaging.sql
  （改 create_direct_conversation / create_profile_conversation /
  create_activity_conversation 三个函数，改 messages_insert_own_as_active_member
  策略）
- src/repositories/ 新增 user-blocks-repository.ts
- src/features/ 新增 blocks/ 目录（如 use-block-user-mutation.ts、
  use-unblock-user-mutation.ts、use-is-blocked-query.ts）
- src/pages/profile/user-profile-page.tsx（加"屏蔽此人/取消屏蔽"按钮，
  参照现有 isOwnProfile 判断逻辑：自己主页不显示）
- src/pages/messages/conversation-page.tsx（加屏蔽入口）
- src/types/database.generated.ts（迁移后重新生成）
- docs/03_Database/Tables.md（同步新表和改动过的函数/策略）
- 对应测试文件

禁止修改：
- 举报相关代码（reports 表、举报页面——见任务卡 2/3/4）
- 管理员账号管理页面（users-page.tsx）和 set_account_status 相关逻辑
- 帖子/活动/评论的现有业务逻辑（除了在消息相关函数里加屏蔽检查这一处）

表结构建议（已核实：命名和索引风格跟本仓库其它表一致，可以直接参考，不是强制）：
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);
create unique index user_blocks_blocker_blocked_unique_idx
  on public.user_blocks (blocker_id, blocked_id);
RLS：只放行 blocker_id = auth.uid() 的 select/insert/delete（屏蔽/取消屏蔽是
自己维护自己的一份名单，不需要走 security definer 函数，也不需要软删除——
取消屏蔽用真删除，参照 favorites-repository.ts 里取消收藏就是直接
.delete() 的先例，不用发明新模式）。

要求：
1. 修改前阅读：
   - docs/01_Product/PRD.md
   - docs/02_SystemDesign/Architecture.md
   - docs/03_Database/Tables.md
   - docs/04_Development/AI-Development.md
   - docs/04_Development/Apple-UGC-Compliance-Review.md（第四节，屏蔽用户的设计背景）
   - supabase/migrations/20260716000400_create_messaging_tables.sql
   - supabase/migrations/20260818070309_create_profile_conversation_function.sql
   - supabase/migrations/20260815182042_create_activity_conversation_function.sql
2. 先检查 git status，确认在 saminest-v2 目录、不是 saminest 目录。
3. 不覆盖现有未提交修改。
4. 不创建第二个 Supabase Client，不注册第二个 Auth listener。
5. 数据库变化必须使用 migration，且要在本地跑 supabase db reset 验证过再说完成。
6. 用一个 SECURITY DEFINER 的公共函数（比如 is_blocked_pair(uuid, uuid)）判断
   双向屏蔽关系，三处会话创建函数和 messages 插入策略都复用这一个函数，不要
   写三份重复的判断逻辑。
7. 运行：
   - npm run typecheck
   - npm run test
   - npm run build
   - git diff --check
8. 不自动提交或推送。
9. 完成后报告：
   - 修改摘要
   - 文件清单
   - 验证结果（哪些命令实际跑了、结果如何）
   - git status
   - 剩余风险（尤其是 messages 插入策略这部分你是怎么实现的、有没有验证过
     "A 屏蔽 B 之后，B 在已有会话里发消息会被拒绝"这个场景）

验收标准（至少手动验证这几条）：
- 用户 A 屏蔽用户 B 后，B 在 A 的主页点"发消息"应该失败（或者按钮本身就不可用，
  两种做法都可以，但至少后端必须真正拒绝，不能只是前端隐藏）
- A 屏蔽 B 之前如果已经有一条会话，屏蔽后 B 在这条会话里发消息应该被拒绝
- A 取消屏蔽 B 后，上面两条行为都应该恢复正常
- 用户不能屏蔽自己
- 普通用户不能读取/修改别人的屏蔽名单（只能操作 blocker_id = 自己 的记录）
```

---

## 任务卡 2（P0）：举报用户

```text
请在当前 Saminest 仓库中完成以下任务。

目标：
让登录用户可以在任意用户主页举报这个用户本人（跟现有"举报帖子/举报活动/举报评论"
是同一套机制，只是 target_type 换成 "user"）。管理员能在举报处理后台看到这类举报，
并且能方便地跳转到账号管理去处置被举报的用户。

背景（已核实的现状）：
- reports 表的 reports_target_type_check 约束（最新一次是
  supabase/migrations/20260816171649_allow_activity_reports.sql 改的）目前是
  check (target_type = any (array['post', 'comment', 'activity']))，没有 'user'。
- src/pages/profile/user-profile-page.tsx 顶部注释明确写了："这个仓库目前没有
  '举报用户'这个功能（只有举报活动/举报帖子），先不在菜单里放一个点了会 404
  的空壳入口，等举报用户功能真的做出来再补"——现在就是把这个入口补上的时候，
  TopBar 组件的 moreMenu 已经是现成的可选 prop，之前特意没传。
- src/pages/report/report-activity-page.tsx 是可以直接照抄的模板：同一个
  useCreateReportMutation、同一套 REPORT_REASON_OPTIONS、同一套
  REPORT_DUPLICATE/ACCOUNT_RESTRICTED 错误处理，只需要把 targetType 换成
  "user"、id 换成 userId、文案换成"举报用户"。
- src/repositories/reports-repository.ts 的 CreateReportInput.targetType 类型
  目前是 "post" | "comment" | "activity"，需要加上 "user"。

允许修改：
- 新建 supabase/migrations/<timestamp>_reports_allow_user_target.sql
  （只改 reports_target_type_check，参照 20260804000200_reports_allow_comment_target.sql
  的写法：drop 再 add，加一条回滚注释）
- src/repositories/reports-repository.ts（CreateReportInput.targetType 类型扩展）
- src/features/reports/use-create-report-mutation.ts（同样的类型扩展）
- 新建 src/pages/report/report-user-page.tsx（复制 report-activity-page.tsx 改造）
- src/router/routes.tsx（新增 /users/:userId/report 路由）
- src/pages/profile/user-profile-page.tsx（给 TopBar 传 moreMenu，加"举报用户"选项，
  自己主页不显示这个入口）
- src/pages/admin/reports-page.tsx（target_type === "user" 时的展示逻辑，见下方）
- src/repositories/reports-repository.ts 的 fetchTargetTitles/listReportsForModeration
  （批量查被举报用户的 display_name，跟现在批量查 post/activity 标题是同一个模式）
- 对应测试文件

禁止修改：
- 屏蔽用户相关代码（任务卡 1，两者可以互相独立开发，谁先谁后不影响）
- 账号管理页面 set_account_status 相关逻辑本身（只是从举报列表加一个跳转链接
  过去，不改这个功能内部实现）
- 帖子/活动/评论的举报逻辑（不动现有分支，只新增 "user" 分支）

管理后台展示建议：
target_type === "user" 的举报行，展示被举报用户的昵称（复用批量查询模式），
并加一个链接跳转到 /admin/users（如果 AdminUsersPage 的搜索支持按用户 ID 或
昵称跳转定位，就直接带参数跳过去；如果现在的搜索只支持昵称/邮箱模糊搜索，
先做成"跳转到账号管理页 + 提示管理员自己搜索这个昵称"这种简化版本也可以，
不强求这次做到精确定位，避免为了这一个小细节扩大任务范围）。

要求：
1. 修改前阅读：
   - docs/01_Product/PRD.md
   - docs/02_SystemDesign/Architecture.md
   - docs/03_Database/Tables.md
   - docs/04_Development/AI-Development.md
   - docs/04_Development/Apple-UGC-Compliance-Review.md（第三节）
   - src/pages/report/report-activity-page.tsx（作为改造模板）
   - src/pages/profile/user-profile-page.tsx（改之前先看懂现有的 isOwnProfile /
     TopBar moreMenu 用法）
2. 先检查 git status。
3. 不覆盖现有未提交修改。
4. 不创建第二个 Supabase Client，不注册第二个 Auth listener。
5. 数据库变化必须使用 migration，本地 supabase db reset 验证过。
6. 运行：
   - npm run typecheck
   - npm run test
   - npm run build
   - git diff --check
7. 不自动提交或推送。
8. 完成后报告：修改摘要、文件清单、验证结果、git status、剩余风险。

验收标准：
- 登录用户能在别人主页提交"举报用户"，未登录跳转登录页，不能举报自己
- 同一用户对同一被举报人重复举报（还在处理中）会被拒绝，跟现有帖子/评论
  举报的防重复行为一致
- 管理员在 /admin/reports 能看到 target_type = user 的举报，能看到被举报人昵称
```

---

## 任务卡 3（P0）：举报队列里展示被举报评论的原文

```text
请在当前 Saminest 仓库中完成以下任务。

目标：
管理员在 /admin/reports 处理一条 target_type = "comment" 的举报时，能直接在
这条举报行里看到评论原文、作者昵称、所属帖子标题（可点击跳转），不再是现在
这样只显示一行 "comment / <id>" 纯文本。这次只做"看得见"，不做删除评论的
功能（删除评论是任务卡 4，两个分开做）。

背景（已核实的现状）：
- src/pages/admin/reports-page.tsx 第 288-298 行左右，target_type 不是
  "post"/"activity" 时直接 fallback 成 `${report.targetType} / ${report.targetId}`
  纯文本。
- src/repositories/reports-repository.ts 的 fetchTargetTitles 函数现在只批量
  查 post 和 activity 的标题，代码注释明确写了 "comment" 及其它未来可能出现的
  target_type 直接跳过，不去查任何表"——这次要把 comment 这个分支补上。
- 关键权限问题：public.comments 表的 comments_select_of_approved_or_own_posts
  这条 SELECT 策略（supabase/migrations/20260804000000_create_comments_table.sql）
  只放行"评论所属帖子已审核公开"或"帖子作者本人"两种情况，没有 is_admin() 例外。
  也就是说即使前端加了展示逻辑，如果被举报评论所属的帖子当时状态不是"已审核
  公开"（比如已经被下架/还在待审核），管理员用当前权限查不到这条评论——必须
  先在这条策略里加一条 or public.is_admin() 分支，参照本仓库自己在
  docs/04_Development/AI-Development.md 之外记录的"post_images 表也需要同样的
  is_admin() 例外"这条已知技术债的修法（reports-repository.ts 里 posts 的批量
  查询能一次性查到所有状态的帖子，就是因为 posts_select_public_or_own_or_admin
  这条策略已经有 is_admin() 例外，这次是把同样的模式补到 comments 表）。
- 不需要做"举报时的内容快照"：评论是软删除（deleted_at），删除时 content
  字段原文不会被清空，只要管理员的 SELECT 权限打开了，随时能查到原文，不用
  新建快照表——这个判断已经在 Apple-UGC-Compliance-Review.md 第六节写清楚了，
  照做即可，不要另外设计快照机制。

允许修改：
- 新建 supabase/migrations/<timestamp>_comments_select_admin_exception.sql
  （给 comments_select_of_approved_or_own_posts 加 is_admin() 例外，drop + create）
- src/repositories/reports-repository.ts（fetchTargetTitles 改造成同时支持
  post/activity/comment 三种类型的批量查询；AdminReportListItem 新增字段，
  比如 commentPreview: { content: string; isDeleted: boolean; authorDisplayName:
  string; postId: string; postTitle: string | null } | null）
- src/pages/admin/reports-page.tsx（target_type === "comment" 时渲染评论原文，
  blockquote 样式，deleted_at 不为空时加"该评论已被用户删除"标签但仍展示原文，
  加所属帖子的可点击链接，参照现有 post 分支的 <Link> 写法）
- 对应测试文件

禁止修改：
- comments 表的 INSERT/DELETE(软删除) 策略（comments_insert_own /
  comments_delete_own）——这次只加 SELECT 的 is_admin() 例外，不动这两条
- 举报提交流程本身（report-post-page.tsx / comment-item.tsx 里的举报表单）
- 管理员删除帖子/处理举报的现有 resolve/dismiss 逻辑

要求：
1. 修改前阅读：
   - docs/01_Product/PRD.md
   - docs/03_Database/Tables.md
   - docs/04_Development/AI-Development.md
   - docs/04_Development/Apple-UGC-Compliance-Review.md（第六节，含业界参考和
     为什么不用做快照的判断）
   - supabase/migrations/20260804000000_create_comments_table.sql
   - src/repositories/reports-repository.ts（先看懂 fetchTargetTitles 现在
     怎么给 post/activity 做批量查询，照同一个模式扩展，不要另起一套写法）
2. 先检查 git status。
3. 数据库变化必须使用 migration，本地 supabase db reset 验证过——这次改的是
   一条已有 RLS 策略，验证时要测"管理员能查到帖子已下架的评论"和"普通用户
   仍然查不到别人不可见帖子下的评论"两种场景，不能只测好的那一种。
4. 运行：npm run typecheck / npm run test / npm run build / git diff --check
5. 不自动提交或推送。
6. 完成后报告：修改摘要、文件清单、验证结果、git status、剩余风险。

验收标准：
- 管理员打开一条评论举报，能直接看到评论原文、作者昵称、所属帖子标题和链接，
  不用跳出这个页面
- 即使被举报评论所属的帖子已经被下架/待审核，管理员依然能看到评论原文
- 即使被举报评论已经被用户自己软删除，管理员依然能看到原文，并且看到"已被
  用户删除"的提示
- 普通用户（非管理员）通过前端能查到的评论范围跟改动前完全一样，没有被
  意外放宽权限
```

---

## 任务卡 4（P0）：管理员能删除违规评论 / 下架违规活动

```text
请在当前 Saminest 仓库中完成以下任务。

目标：
管理员处理"评论举报"或"活动举报"时，能像现在处理"帖子举报"一样，勾选"同时
删除该评论/下架该活动"，一步完成"举报处理 + 移除违规内容"，不再需要另外找
后门去删。这张任务卡建议在任务卡 3（先能看到评论原文）做完之后再做。

背景（已核实的现状）：
- src/repositories/admin-repository.ts 现在只有 approvePost / rejectPost /
  resolveReport / dismissReport / deletePost / setAccountStatus 六个函数，
  对应 supabase/migrations/20260717000300_admin_moderation_actions_functions.sql
  的 approve_post/reject_post/resolve_report/dismiss_report 和
  20260717000500_delete_post_function.sql 的 delete_post。没有任何"管理员删
  评论"或"管理员下架活动"的函数。
- 评论的软删除目前只有 comments_delete_own 这一条 UPDATE 策略
  （supabase/migrations/20260804000000_create_comments_table.sql，被
  20260805000000_fix_comments_insert_delete_infinite_recursion.sql 改过一次，
  用 get_comment_snapshot() 这个 SECURITY DEFINER 函数避免自引用递归），
  硬编码只放行 user_id = auth.uid()，管理员现在完全没有路径能软删除别人的评论。
- 活动这边 useCancelActivityMutation / cancelActivity（src/repositories/
  activities-repository.ts）是"发起人取消自己的活动"，具体的权限判断和状态
  流转（活动被取消后 status 变成什么、cancelActivity 内部是直接 UPDATE 还是
  也走了一个 security definer 函数）需要你先打开 activities-repository.ts 和
  对应的 20260815042354_create_go_together_activities_schema.sql 迁移确认，
  这次审查没有深入看这部分，不要直接假设它的实现方式。
- src/pages/admin/reports-page.tsx 现在"同时删除该帖子"这个复选框（约第 351
  行）的显示条件是 report.targetType === "post"，需要扩展成 "post" | "comment"
  | "activity" 三种都显示，按类型调用不同的删除/下架函数。现有的"举报处理
  成功但删除失败"降级提示逻辑（PARTIAL_DELETE_FAILURE_MESSAGE 那一段状态
  处理）已经是通用的，改成按 targetType 调用不同函数即可，不需要重新设计
  这部分状态流转。

允许修改：
- 新建 supabase/migrations/<timestamp>_admin_delete_comment_function.sql
  （新增 delete_comment(target_comment_id uuid, delete_reason text) security
  definer 函数：校验 is_admin()、delete_reason 必填、软删除对应评论、写一条
  moderation_actions 记录，参照 delete_post 的模式）
- 新建 supabase/migrations/<timestamp>_admin_cancel_activity_function.sql
  （新增管理员下架活动的函数，具体命名和实现方式取决于你先读完
  activities-repository.ts 之后对现有 cancelActivity 实现的判断，如果现有
  cancelActivity 已经是走 security definer 函数，优先复用同一个函数加
  is_admin() 分支，不要平白无故建两个几乎一样的函数）
- src/repositories/admin-repository.ts（新增 deleteComment / adminCancelActivity
  包装函数，参照 deletePost 的写法）
- src/pages/admin/reports-page.tsx（"同时删除"复选框扩展到评论/活动类型）
- 对应测试文件

禁止修改：
- 任务卡 3 已经做的评论内容展示逻辑（这张卡建立在它之上，不要重复实现）
- 组织者自己取消活动的现有前端入口（my-activities-page.tsx 等），除非确认
  它跟管理员下架共用同一个后端函数、需要同步调整调用方式
- 举报的 resolve/dismiss 状态机本身

要求：
1. 修改前阅读：
   - docs/01_Product/PRD.md
   - docs/03_Database/Tables.md
   - docs/04_Development/AI-Development.md
   - docs/04_Development/Apple-UGC-Compliance-Review.md（第五、六节）
   - supabase/migrations/20260717000500_delete_post_function.sql（delete_post
     的实现模板）
   - supabase/migrations/20260805000000_fix_comments_insert_delete_infinite_recursion.sql
     （get_comment_snapshot 这个坑，新函数如果需要引用评论当前值，直接复用
     这个函数，不要重新手写一个自引用子查询）
   - src/repositories/activities-repository.ts + 对应的活动状态相关迁移文件
     （先搞清楚 cancelActivity 现在到底怎么实现的，再决定新函数怎么写）
2. 先检查 git status。
3. 数据库变化必须使用 migration，本地 supabase db reset 验证过。
4. 运行：npm run typecheck / npm run test / npm run build / git diff --check
5. 不自动提交或推送。
6. 完成后报告：修改摘要、文件清单、验证结果、git status、剩余风险（尤其是
   活动下架这部分，如果对现有 cancelActivity 实现的判断跟这张卡的假设不一样，
   要在报告里说明你实际怎么处理的、为什么）。

验收标准：
- 管理员处理评论举报时勾选"同时删除该评论"，评论被软删除、moderation_actions
  有记录，前端评论区正确显示"该评论已删除"占位
- 管理员处理活动举报时勾选"同时下架该活动"，活动状态正确变化、
  moderation_actions 有记录
- 举报处理成功但删除/下架失败时，能看到跟现有"帖子删除失败"一样的降级提示，
  不会让管理员误以为整个操作都失败了
- 普通用户（非管理员、非评论作者/活动发起人本人）依然不能删除别人的评论
  或下架别人的活动
```
