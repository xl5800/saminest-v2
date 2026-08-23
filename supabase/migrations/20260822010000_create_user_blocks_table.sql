-- Migration: create user_blocks table (用户屏蔽)
--
-- 为什么改：
--   docs/04_Development/Apple-UGC-Compliance-Review.md 第四节："block
--   abusive users"是苹果 UGC 类 App 审核几乎必查的一条，Saminest 目前
--   只有管理员能"设为受限/封禁"（后台操作），普通用户之间完全没有互相
--   屏蔽的能力——被骚扰的用户不可能也不应该等着找客服，需要能自己立刻
--   屏蔽对方。这份迁移只建数据结构（表 + RLS），屏蔽生效到私信创建/发送
--   这两处的检查放在下一份迁移
--   20260822020000_enforce_user_blocks_in_messaging.sql（先把表和基础
--   RLS 建好、独立验证过，再叠加"消息层怎么用它"这一步，方便分开排查）。
--
-- 影响哪些表：
--   新建 public.user_blocks。外键指向 public.profiles（blocker_id /
--   blocked_id 都指向 profiles.id）。
--
-- 是否影响现有数据：
--   不影响，全新表，不写入任何测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 设计说明：
--   1. 屏蔽是单向的（我屏蔽你，不代表你屏蔽我）——`blocker_id` 是发起屏蔽
--      的人，`blocked_id` 是被屏蔽的人，一行只代表"blocker 屏蔽了
--      blocked"这一个方向。检查"这两个人之间是否存在屏蔽关系"时按无方向
--      匹配（任一方向存在记录就拦截），这个逻辑不属于这张表本身的职责，
--      放在下一份迁移的 is_blocked_pair() 函数里。
--   2. 用户自己维护自己发起的这份屏蔽名单，不需要 security definer 函数：
--      RLS 直接放行 blocker_id = auth.uid() 的 select/insert/delete——跟
--      favorites 表"用户自己维护自己的收藏关系，直接开放 RLS，不需要
--      走函数"是同一个模式（活动收藏、帖子收藏都是这么做的），屏蔽在
--      "用户维护一份只属于自己的关系名单"这一点上跟收藏没有本质区别。
--   3. 取消屏蔽用真删除，不做软删除——参照 favorites-repository.ts
--      removeFavorite() 直接 .delete() 的先例：这张表本身就是"关系是否
--      存在"这个布尔状态的记录，不需要保留"曾经屏蔽过又取消"的历史，跟
--      favorites 是同一个道理，不用为了跟大多数内容表（posts/comments
--      等）保持"一律软删除"的表面一致性而给一张纯关系表发明不需要的
--      软删除字段。
--   4. 唯一索引建在 (blocker_id, blocked_id) 上（不加 where 条件）——
--      因为这张表从设计上就不会有"软删除后允许同一对用户重新占用这个
--      组合"这种诉求（没有软删除，见上一条），不需要像
--      conversations_direct_post_creator_unique_idx 那样额外排除
--      deleted_at 的情况。
create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),

  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  '用户屏蔽关系：blocker_id 屏蔽了 blocked_id，单向记录，参见
   docs/03_Database/Tables.md 第 38 节和
   docs/04_Development/Apple-UGC-Compliance-Review.md 第四节。';

create unique index user_blocks_blocker_blocked_unique_idx
  on public.user_blocks (blocker_id, blocked_id);

-- 服务"是否存在 blocked_id 屏蔽了我"这一类反向查询——is_blocked_pair()
-- （下一份迁移）需要能高效判断任一方向是否存在记录，只有 (blocker_id,
-- blocked_id) 这个唯一索引只对"blocker_id 在前"的查询友好，反过来按
-- blocked_id 查会走全表扫描，所以另加一个只覆盖 blocked_id 的索引。
create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- 权限原则：用户只能读取/新增/删除自己发起的屏蔽记录（blocker_id =
-- auth.uid()）——这是"我屏蔽的人"这份名单，不是公共可查的关系，也不能
-- 让用户直接读到"谁屏蔽了我"（那属于 is_blocked_pair() 这个 security
-- definer 函数内部才能看到的信息，不通过表本身的 RLS 暴露给任何角色，
-- 包括被屏蔽的那一方自己）。
create policy user_blocks_select_own
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

create policy user_blocks_insert_own
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid());

create policy user_blocks_delete_own
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists user_blocks_delete_own on public.user_blocks;
-- drop policy if exists user_blocks_insert_own on public.user_blocks;
-- drop policy if exists user_blocks_select_own on public.user_blocks;
-- drop index if exists user_blocks_blocked_id_idx;
-- drop index if exists user_blocks_blocker_blocked_unique_idx;
-- drop table if exists public.user_blocks;
