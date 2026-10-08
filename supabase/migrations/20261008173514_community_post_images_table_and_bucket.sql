-- Migration: 社区功能 阶段五——社区帖子图片（community_post_images 表 + 独立 Storage bucket）
--
-- 为什么改：
--   阶段一明确砍掉了社区帖子的图片支持，这次补上。做法是给社区帖子镜像出
--   一套跟 posts/post_images 完全平行的后端（新表 + 新 bucket），而不是改
--   post_images 让它同时兼容两种帖子——两张帖子表的 id 空间不重叠，
--   "每种内容各自一个 bucket"是这个仓库的既有惯例（avatars/feedback-images/
--   message-images 都是独立 bucket）。
--
--   以下全部是对着 post_images 的**当前最终形态**（含 20260722000300 修的
--   UPDATE 策略递归 + SELECT 策略 deleted_at 问题、20260723000100 把
--   (post_id, sort_order) 唯一约束改成只对未软删除行生效的局部唯一索引、
--   20260722000500 把 bucket 上限提到 20MB）逐项照抄，并已经跟远程库实际的
--   pg_policies / pg_indexes / storage.buckets 核对过一致，不是照抄最初的
--   建表迁移——那份里面的几个已知 bug 这里不重新引入。
--
--   字段名跟 post_images 逐字一致（public_url / sort_order / deleted_at /
--   width / height / size_bytes / mime_type / alt_text 不加前缀），这样
--   前端 posts-repository.ts 的 resolveCoverImageUrl 可以直接复用。
--
-- 影响哪些表：
--   新建 public.community_post_images（外键指向 community_posts / profiles）；
--   新增函数 public.get_community_post_image_snapshot()（跟
--   get_post_image_snapshot 同一个模式，给 UPDATE 策略 with check 用，绕开
--   自引用子查询的 RLS 递归）；storage.buckets 新增一行
--   （id = 'community-post-images'）；storage.objects 新增只针对这个
--   bucket_id 的四条策略（select/insert/update/delete）。
--
-- 权限原则（跟 post_images 同构，只把 posts 换成 community_posts）：
--   - 所有人可以读取"已公开"社区帖子（status = 'approved' 且未软删除）的
--     未软删除图片；作者可以读自己（未软删除）帖子的图片；管理员可以读全部。
--     community_posts 没有 visibility 列，所以比 post_images 的公开分支少
--     一个 visibility = 'public' 条件，其余一致。
--   - 只有帖子作者可以给自己的帖子新增图片、更新（软删除）自己的图片；
--     没有 DELETE 策略（不开放硬删除，跟 post_images 一致）。
--   - Storage：路径 {user_id}/{community_post_id}/{image_id}.<ext>，用路径第
--     一段匹配 auth.uid() 判断归属（跟 post-images 同一个写法，不依赖
--     storage.objects 的 owner/owner_id 列）。
--
-- 是否影响现有数据：
--   不影响，全新表、全新 bucket。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

create table public.community_post_images (
  id uuid primary key default gen_random_uuid(),
  community_post_id uuid not null references public.community_posts (id),
  owner_id uuid not null references public.profiles (id),
  storage_path text not null,
  public_url text null default null,
  alt_text text null default null,
  width integer null default null,
  height integer null default null,
  size_bytes bigint null default null,
  mime_type text null default null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null default null,

  constraint community_post_images_storage_path_key unique (storage_path)
);

comment on table public.community_post_images is
  '社区帖子图片元数据，文件本体在 Storage 的 community-post-images bucket，结构镜像 post_images。';

create index community_post_images_community_post_id_idx
  on public.community_post_images (community_post_id);
create index community_post_images_owner_id_idx
  on public.community_post_images (owner_id);

-- 同一个帖子下"当前有效的"图片 sort_order 唯一；软删除的行不占坑位
-- （见 20260723000100 的教训，直接用局部唯一索引，不先建全表唯一约束）。
create unique index community_post_images_post_id_sort_order_active_key
  on public.community_post_images (community_post_id, sort_order)
  where deleted_at is null;

alter table public.community_post_images enable row level security;

create policy community_post_images_select_of_approved_or_own_or_admin
  on public.community_post_images
  for select
  to anon, authenticated
  using (
    (
      deleted_at is null
      and exists (
        select 1 from public.community_posts p
        where p.id = community_post_images.community_post_id
          and p.status = 'approved'
          and p.deleted_at is null
      )
    )
    or exists (
      select 1 from public.community_posts p
      where p.id = community_post_images.community_post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
    or public.is_admin()
  );

create policy community_post_images_insert_own_post
  on public.community_post_images
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.community_posts p
      where p.id = community_post_images.community_post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
  );

-- UPDATE 策略 with check 里"不能顺带改 community_post_id"的锁定，不能写成对
-- 本表的直接自引用子查询（会触发 42P17 无限递归，见 20260722000300），
-- 跟 get_post_image_snapshot 一样用 security definer 快照函数绕开。
create or replace function public.get_community_post_image_snapshot(target_id uuid)
returns public.community_post_images
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.community_post_images
  where id = target_id
    and (owner_id = auth.uid() or public.is_admin());
$$;

revoke execute on function public.get_community_post_image_snapshot(uuid) from public;
grant execute on function public.get_community_post_image_snapshot(uuid) to authenticated;

create policy community_post_images_update_own_post
  on public.community_post_images
  for update
  to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.community_posts p
      where p.id = community_post_images.community_post_id
        and p.author_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and community_post_id = (
      select s.community_post_id from public.get_community_post_image_snapshot(community_post_images.id) s
    )
    and exists (
      select 1 from public.community_posts p
      where p.id = community_post_images.community_post_id
        and p.author_id = auth.uid()
    )
  );

-- Storage bucket：public（公开帖子的图片匿名可见），20MB 上限直接设对
-- （见 20260722000500 的教训：bucket 自己的 file_size_limit 是 Storage 服务端
-- 独立的一道硬限制），MIME 白名单跟 post-images 一致。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-post-images',
  'community-post-images',
  true,
  20 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy community_post_images_storage_select_public
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'community-post-images'
  );

create policy community_post_images_storage_insert_own_folder
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'community-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy community_post_images_storage_update_own_folder
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'community-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'community-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy community_post_images_storage_delete_own_folder
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'community-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行；删 bucket 前需要先清空里面
-- 的文件，否则 Storage 会拒绝删除）：
--
-- drop policy if exists community_post_images_storage_delete_own_folder on storage.objects;
-- drop policy if exists community_post_images_storage_update_own_folder on storage.objects;
-- drop policy if exists community_post_images_storage_insert_own_folder on storage.objects;
-- drop policy if exists community_post_images_storage_select_public on storage.objects;
-- delete from storage.buckets where id = 'community-post-images';
-- drop policy if exists community_post_images_update_own_post on public.community_post_images;
-- drop policy if exists community_post_images_insert_own_post on public.community_post_images;
-- drop policy if exists community_post_images_select_of_approved_or_own_or_admin on public.community_post_images;
-- revoke execute on function public.get_community_post_image_snapshot(uuid) from public;
-- drop function if exists public.get_community_post_image_snapshot(uuid);
-- drop table if exists public.community_post_images;
