-- Migration: admin moderation backend (batch 1)
--
-- 为什么改：
--   后台管理员功能第一批：审核帖子（通过/驳回）、删除帖子、查看举报列表，
--   对应盘点报告确认后的产品决策：
--     1. 删除帖子走软删除（deleted_at），不做硬删除。
--     2. moderator 角色这次不处理，权限判断继续只用现有 is_admin()
--        （admin/super_admin），不做分级。
--
-- 关于"posts 表管理员软删除权限"（本次任务第 1 点）：
--   盘点后确认 posts_update_own_or_admin（见
--   supabase/migrations/20260715220300_create_posts_table.sql）的
--   with check 是 `is_admin() or (...)`——is_admin() 为真时整个 with check
--   直接放行，不受后面那组"字段不能变"的限制约束，也不区分改的是哪个
--   字段。也就是说管理员通过 UPDATE 设置 deleted_at（软删除或恢复）
--   已经可行，没有发现任何遗漏（没有别的约束/触发器会挡住这个操作，
--   posts 表上的 check 约束都不涉及 deleted_at 列）。这条策略本身
--   不需要改，所以这份迁移里没有针对 posts 表的任何 SQL。
--
-- 影响哪些表：
--   - public.reports：SELECT 策略加管理员例外，新增管理员专用 UPDATE 策略。
--   - public.post_images：SELECT 策略加管理员例外（10.5 节技术债，
--     建表时就记录过"文档没提管理员例外，需要另外补一条策略"）。
--   - 新建 public.moderation_actions（Tables.md 第 17 节）。
--
-- 是否影响现有数据：
--   不影响现有数据。reports/post_images 的策略调整只是放宽管理员能看到
--   /能改的范围，不改变已有行的内容；moderation_actions 是全新表。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

-- =====================================================================
-- reports：补充管理员权限
-- =====================================================================

-- SELECT：加 is_admin() 例外，策略改名为 *_or_admin 以准确描述现在的
-- 放行条件（跟 posts_select_public_or_own_or_admin 的命名方式一致）。
drop policy if exists reports_select_own on public.reports;

create policy reports_select_own_or_admin
  on public.reports
  for select
  to authenticated
  using (
    reporter_id = auth.uid()
    or public.is_admin()
  );

-- UPDATE：这是 reports 表第一条 UPDATE 策略。跟 posts_update_own_or_admin
-- 不同的地方——那条策略对管理员是完全放开（is_admin() 为真就不再检查
-- 任何字段），但这次产品要求管理员在 reports 上只能改"处理结果"相关的
-- 四个字段（status / resolution_note / reviewer_id / reviewed_at），
-- 举报本身的内容字段（reporter_id / target_type / target_id /
-- reason_code / description / created_at）即使是管理员也不能通过这条
-- 策略改动，所以 with check 显式把这些字段钉死成跟当前行一致（跟
-- conversation_members_update_self 锁 conversation_id/role 是同一个
-- "查当前存的值来比对"的写法）。description 允许为空，用
-- is not distinct from 做空值安全比较，其余锁定字段都是 not null 列，
-- 直接用 = 即可。
--
-- 普通举报人（非管理员）在这条策略下 using 就已经是 false（他们不满足
-- is_admin()），所以"普通举报人不能改任何字段"这件事不需要额外处理，
-- 这条新策略天然维持现状。
create policy reports_update_admin_only
  on public.reports
  for update
  to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and reporter_id = (
      select r.reporter_id from public.reports r where r.id = reports.id
    )
    and target_type = (
      select r.target_type from public.reports r where r.id = reports.id
    )
    and target_id = (
      select r.target_id from public.reports r where r.id = reports.id
    )
    and reason_code = (
      select r.reason_code from public.reports r where r.id = reports.id
    )
    and description is not distinct from (
      select r.description from public.reports r where r.id = reports.id
    )
    and created_at = (
      select r.created_at from public.reports r where r.id = reports.id
    )
  );

-- =====================================================================
-- post_images：补充管理员例外（10.5 节已知技术债）
-- =====================================================================

drop policy if exists post_images_select_of_approved_or_own_posts on public.post_images;

create policy post_images_select_of_approved_or_own_or_admin
  on public.post_images
  for select
  to anon, authenticated
  using (
    deleted_at is null
    and (
      exists (
        select 1
        from public.posts p
        where p.id = post_images.post_id
          and p.status = 'approved'
          and p.visibility = 'public'
          and p.deleted_at is null
      )
      or exists (
        select 1
        from public.posts p
        where p.id = post_images.post_id
          and p.author_id = auth.uid()
          and p.deleted_at is null
      )
      or public.is_admin()
    )
  );

-- =====================================================================
-- 17. moderation_actions（新建）
-- =====================================================================

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  action_type text not null,
  target_type text not null,
  target_id uuid not null,
  reason_code text null default null,
  note text null default null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),

  -- 17.3 节列出的取值，硬删除这次不在范围内，没有加对应的 action_type。
  -- target_type 文档没有给出一份明确的初始值枚举（不像 reports.target_type
  -- 那样有 12.3 节），这里按字面不加约束，不替文档做主。
  constraint moderation_actions_action_type_check
    check (action_type in (
      'approve_post', 'reject_post', 'archive_post', 'restore_post',
      'restrict_user', 'suspend_user', 'resolve_report', 'dismiss_report'
    ))
);

comment on table public.moderation_actions is
  '管理员对帖子/用户/举报采取的审核操作记录，参见 docs/03_Database/Tables.md 第 17 节。';

-- target_id 故意不加外键——同一张表里 target_type 可能是 post/user/report
-- 等不同对象，target_id 具体指向哪张表取决于 target_type，跟 reports.target_id
-- 是同样的多态引用，18 节外键关系列表里也只列了 actor_id 一条。
--
-- 文档没有专门给 moderation_actions 一份索引清单（不像 15.5 节那样），
-- 按这个项目其它表的一贯做法，给常见查询路径加基础索引：谁做的、
-- 对什么对象做的、什么时候做的。
create index moderation_actions_actor_id_idx
  on public.moderation_actions (actor_id);
create index moderation_actions_target_type_target_id_idx
  on public.moderation_actions (target_type, target_id);
create index moderation_actions_created_at_desc_idx
  on public.moderation_actions (created_at desc);

-- 第 22 节：启用 RLS
alter table public.moderation_actions enable row level security;

-- 17.4 权限原则（按用户给出的范围逐条实现）：
--   - 普通用户不能读取内部审核日志：SELECT 只放行 is_admin()。
--   - 只有具有审核权限的角色可以创建记录：INSERT 只放行 is_admin()，
--     并且要求 actor_id 必须等于 auth.uid()——这一条文档没有字面写，
--     是这次补充的必要限制：如果不锁 actor_id，任何管理员都能插入一条
--     "actor_id 是别的管理员"的记录，审计日志就不可信了，"谁做的"必须
--     是真正发起这次 INSERT 的那个人。
--   - 审核记录原则上不允许普通修改或删除：这次连管理员都不给
--     UPDATE/DELETE 权限（用户明确要求），所以这里完全不写这两种策略——
--     RLS 打开后没有对应策略 = 没有任何角色能改/删，包括管理员在内，
--     审核日志因此不可篡改。
--   - "高风险管理员操作必须记录"是产品/业务流程层面的要求（后台功能
--     实际执行审核动作时要记得调用这张表），不是这张表自己的 RLS 能
--     保证的事，这里不需要额外的数据库约束。

create policy moderation_actions_select_admin
  on public.moderation_actions
  for select
  to authenticated
  using (public.is_admin());

create policy moderation_actions_insert_admin_as_self
  on public.moderation_actions
  for insert
  to authenticated
  with check (
    public.is_admin()
    and actor_id = auth.uid()
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists moderation_actions_insert_admin_as_self on public.moderation_actions;
-- drop policy if exists moderation_actions_select_admin on public.moderation_actions;
-- drop table if exists public.moderation_actions;
--
-- drop policy if exists post_images_select_of_approved_or_own_or_admin on public.post_images;
-- create policy post_images_select_of_approved_or_own_posts
--   on public.post_images
--   for select
--   to anon, authenticated
--   using (
--     deleted_at is null
--     and (
--       exists (
--         select 1 from public.posts p
--         where p.id = post_images.post_id
--           and p.status = 'approved'
--           and p.visibility = 'public'
--           and p.deleted_at is null
--       )
--       or exists (
--         select 1 from public.posts p
--         where p.id = post_images.post_id
--           and p.author_id = auth.uid()
--           and p.deleted_at is null
--       )
--     )
--   );
--
-- drop policy if exists reports_update_admin_only on public.reports;
-- drop policy if exists reports_select_own_or_admin on public.reports;
-- create policy reports_select_own
--   on public.reports
--   for select
--   to authenticated
--   using (reporter_id = auth.uid());
