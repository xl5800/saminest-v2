-- Migration: create post_images table
--
-- 为什么改：
--   建立 public.post_images 表，保存帖子图片的元数据（图片文件本体存放在
--   Supabase Storage 的 post-images bucket），对应
--   docs/03_Database/Tables.md 第 10 节。
--
-- 影响哪些表：
--   新建 public.post_images，外键指向 public.posts / public.profiles
--   （均已由前序迁移建好）。
--
-- 是否影响现有数据：
--   不影响，全新表；本次任务范围只到 post_images 表结构和 RLS，不涉及
--   Storage bucket 本身的创建（bucket 假定已存在，按用户说明是 public），
--   也不写入任何测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

create table public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id),
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

  -- 10.3 节：文档只列了这两个 unique 约束，本迁移未额外发明
  -- 其他 check 约束（例如 width/height/size_bytes 非负）。
  constraint post_images_post_id_sort_order_key unique (post_id, sort_order),
  constraint post_images_storage_path_key unique (storage_path)
);

comment on table public.post_images is
  '帖子图片元数据，文件本体在 Storage，参见 docs/03_Database/Tables.md 第 10 节。';

-- 10.3 节以外，按现有表的索引模式，post_id / owner_id 至少要有索引；
-- (post_id, sort_order) 和 storage_path 已经因为上面的 unique 约束
-- 自动建了索引，这里不重复创建。
create index post_images_post_id_idx on public.post_images (post_id);
create index post_images_owner_id_idx on public.post_images (owner_id);

-- 第 22 节：启用 RLS
alter table public.post_images enable row level security;

-- 10.5 权限原则：
--   - 所有人可以读取公开已审核帖子（posts.status = 'approved'）的图片。
--   - 作者可以读取自己帖子的图片，不论该帖子是 status 什么值，但帖子
--     本身被软删除（deleted_at 不为 null）时不算在内（这条是按用户
--     后续指令加的例外，不是 10.5 字面写的，两条用 or 连接）。
--   - 用户只能新增/管理（更新、软删除）自己帖子的图片记录。
--
-- 特别说明（需要你确认，不是文档字面写明的内容）：
--   1. 文档 10.5 没有单独提到管理员例外，所以这里没有像 profiles/
--      categories/locations/posts 那样加 public.is_admin() 的旁路。如果
--      需要管理员也能读取/管理所有帖子的图片（例如审核时查看待审图片），
--      需要另外补一条策略。
--   2. 没有 DELETE 策略：post_images 在 21 节被列为需要软删除的表，
--      和 posts 表一样只提供 UPDATE（用于设置 deleted_at 等字段），
--      不开放硬删除权限，这和 posts 表当前只有 insert/select/update、
--      没有 delete 策略的写法保持一致。

create policy post_images_select_of_approved_or_own_posts
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
    )
  );

create policy post_images_insert_own_post
  on public.post_images
  for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.posts p
      where p.id = post_images.post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
  );

create policy post_images_update_own_post
  on public.post_images
  for update
  to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.posts p
      where p.id = post_images.post_id
        and p.author_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and post_id = (select pi.post_id from public.post_images pi where pi.id = post_images.id)
    and exists (
      select 1
      from public.posts p
      where p.id = post_images.post_id
        and p.author_id = auth.uid()
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists post_images_update_own_post on public.post_images;
-- drop policy if exists post_images_insert_own_post on public.post_images;
-- drop policy if exists post_images_select_of_approved_or_own_posts on public.post_images;
-- drop table if exists public.post_images;
