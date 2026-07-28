-- Migration: create feedback + feedback_images tables
--
-- 为什么改：
--   "用户意见反馈"功能第一批：登录用户可以提交反馈（类型/标题/内容/可选
--   最多 3 张截图），提交后进入待处理队列。这份迁移只建数据结构 + RLS，
--   后台管理界面（查看/改状态/回复）这次不做，范围已经和用户确认过。
--
-- 影响哪些表：
--   新建 public.feedback、public.feedback_images。外键指向 public.profiles
--   （feedback.user_id / feedback_images.owner_id）和 public.feedback
--   （feedback_images.feedback_id）。
--
-- 是否影响现有数据：
--   不影响，两张全新表，不写入任何测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 设计说明（跟这个项目今晚在 posts/post_images 上踩过、修过的坑直接相关，
-- 这次从一开始就按修好之后的版本来，不重蹈覆辙）：
--
--   1. feedback_images 的 (feedback_id, sort_order) 唯一性，直接用局部
--      唯一索引（只约束 deleted_at is null 的行），不用表级 UNIQUE 约束——
--      今晚 post_images 表级 UNIQUE(post_id, sort_order) 覆盖了软删除的行，
--      导致"删图后重新上传，新图按‘当前显示数量’重新编号，撞上还占着坑的
--      旧软删除记录"这个 bug（Storage 传完了，数据库 insert 失败，留下
--      孤儿文件），已经用一份新迁移改成局部唯一索引修过。feedback_images
--      直接用修好之后的写法建表，不需要再单独修一次。
--
--   2. 这次没有给 feedback_images 建 UPDATE 策略，也没有建
--      get_feedback_image_snapshot() 这种 security definer 快照函数——
--      今晚同样在 post_images 上发现，UPDATE 策略里如果用自引用子查询锁
--      字段（`select ... from 本表 where id = 本表.id`），会触发 42P17
--      无限递归；SELECT 策略如果对"作者能看自己的行"这个分支也要求
--      `deleted_at is null`，作者把 deleted_at 从 null 改成 now() 的那一刻，
--      新行对自己就不可见，UPDATE 会报 42501——这两个坑都是"这张表存在
--      UPDATE（软删除）路径"才会暴露。这一批 feedback_images 完全没有
--      "提交之后删除/替换某张截图"这个功能（选图组件里的"移除"是提交前的
--      本地状态，从来没有落库过），没有任何代码会对这张表发起 UPDATE，
--      这两个坑因此不会被触发，不需要提前建一个这次用不到的函数和策略。
--      以后如果要做"删除已提交反馈的某张截图"，需要专门一份新迁移，照抄
--      get_post_image_snapshot() 的模式建一个同构的 security definer
--      快照函数。
--
--   3. feedback 表这次不建 updated_at 列——按用户给出的字段列表（只有
--      id/user_id/type/title/content/status/created_at），跟这个项目里
--      其它表几乎全都有 updated_at 自动维护触发器的惯例不一致，但这次
--      没有任何代码会 UPDATE 这张表（status 默认值 pending，改状态是
--      后台管理界面的范围，这次不做），实际没有影响。以后接后台改状态
--      功能时，需要一份新迁移补 updated_at 列 + 触发器。

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  type text not null,
  title text not null,
  content text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),

  constraint feedback_type_check
    check (type in ('bug', 'suggestion', 'complaint', 'other')),
  constraint feedback_status_check
    check (status in ('pending', 'in_progress', 'resolved', 'closed')),
  -- 长度区间跟 submit-feedback-page.tsx / feedback-validation.ts 前端校验
  -- 保持一致（标题 5-50 字，内容 10-500 字），不能只在前端挡，数据库这层
  -- 也要有底线约束，防止绕过前端直接调 API。
  constraint feedback_title_length_check check (char_length(title) between 5 and 50),
  constraint feedback_content_length_check check (char_length(content) between 10 and 500)
);

comment on table public.feedback is
  '用户提交的产品反馈（bug/建议/投诉/其它），第一批只支持提交和数据库层查询，
   没有后台管理界面。';

create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_status_idx on public.feedback (status);
create index feedback_created_at_desc_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- 权限原则：
--   - 登录用户可以提交自己的反馈（user_id 必须是自己，账号受限的用户
--     不能提交——跟 posts_insert_own/reports_insert_own 同一个理由，反馈
--     属于"输出类"行为）。
--   - 用户只能查看自己提交过的反馈，管理员可以查看全部（这次没有后台
--     UI 消费这条策略，但数据层先按最终形态建好，不需要以后再改一次
--     RLS）。
--   - 没有 UPDATE/DELETE 策略：不给任何角色（包括管理员）直接改这张表，
--     后台管理界面上线时如果需要改 status/回复，走专门的策略或者
--     security definer 函数，这次不提前开放，跟 reports 表当初"举报提交
--     这一半"的做法一致。
create policy feedback_select_own_or_admin
  on public.feedback
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy feedback_insert_own
  on public.feedback
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_account_restricted()
  );

-- =====================================================================
-- feedback_images
-- =====================================================================

create table public.feedback_images (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback (id),
  owner_id uuid not null references public.profiles (id),
  storage_path text not null,
  public_url text null default null,
  width integer null default null,
  height integer null default null,
  size_bytes bigint null default null,
  mime_type text null default null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null default null,

  constraint feedback_images_storage_path_key unique (storage_path)
);

comment on table public.feedback_images is
  '反馈截图元数据，文件本体在私有 Storage bucket feedback-images 里，
   参见 supabase/migrations/20260724000100_storage_feedback_images_bucket_and_policies.sql。';

-- 局部唯一索引，只约束未软删除的行——从一开始就按 post_images 修好之后
-- 的版本来，见文件顶部的设计说明第 1 点。
create unique index feedback_images_feedback_id_sort_order_active_key
  on public.feedback_images (feedback_id, sort_order)
  where deleted_at is null;

create index feedback_images_feedback_id_idx on public.feedback_images (feedback_id);
create index feedback_images_owner_id_idx on public.feedback_images (owner_id);

alter table public.feedback_images enable row level security;

-- 权限原则：
--   - 本人可以新增/查看自己反馈下的图片，管理员可以查看全部。
--   - 没有 UPDATE/DELETE 策略：见文件顶部设计说明第 2 点，这一批没有
--     "提交后删除/替换截图"的功能，不建这两条策略、也不建配套的
--     security definer 快照函数。
--   - SELECT 里的 deleted_at is null 这个条件目前是恒真的死条件（没有
--     任何路径能把它设成非 null），保留是为了跟 post_images 的模式一致、
--     也防御性地覆盖"以后有人用 service role 之类的方式手动软删除了一行"
--     这种边缘情况，不是这次需要它生效。
create policy feedback_images_select_own_or_admin
  on public.feedback_images
  for select
  to authenticated
  using (
    deleted_at is null
    and (owner_id = auth.uid() or public.is_admin())
  );

create policy feedback_images_insert_own_feedback
  on public.feedback_images
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.feedback f
      where f.id = feedback_images.feedback_id
        and f.user_id = auth.uid()
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists feedback_images_insert_own_feedback on public.feedback_images;
-- drop policy if exists feedback_images_select_own_or_admin on public.feedback_images;
-- drop table if exists public.feedback_images;
--
-- drop policy if exists feedback_insert_own on public.feedback;
-- drop policy if exists feedback_select_own_or_admin on public.feedback;
-- drop table if exists public.feedback;
