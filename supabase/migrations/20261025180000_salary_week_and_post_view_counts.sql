-- 第二批：招聘薪资加"周薪"；帖子浏览次数（只有作者本人和管理员能看到）。
--
-- 1. 薪资单位加 week（周薪）
--    发布页改成只给"时薪 / 周薪 / 月薪"三个选项。数据库里原来的 day / year
--    保留不删（以后万一有老帖子用到，编辑时不会因为约束报错），只是前端不再
--    让新帖子选。
--
-- 2. 浏览次数
--    为什么改：posts 表上本来有一列 view_count，但从来没有任何代码给它加数，
--    所有帖子都是 0；而且这一列跟帖子其它字段一样，任何人都能通过接口查到。
--    现在要的是：有人打开详情页就记一次（作者自己看不算），只有作者本人和
--    管理员能看到数字。
--
--    做法：新建一张 post_view_counts 表单独存浏览次数，不用 posts.view_count：
--    - posts 表对所有人开放读取，没法只藏住其中一列（Postgres 里对整张表授了
--      SELECT 之后，再单独收回某一列不起作用；要做就得改成逐列授权，以后每加
--      一列都要记得补授权，很容易漏）。单独一张表可以直接用 RLS：只有帖子作者
--      和管理员能读。
--    - 没有任何写入策略，计数只能通过 record_post_view() 加，不能被随便改。
--    - posts.view_count 原样留着不动（一直是 0，没有代码用它），免得动到 posts
--      表现有的更新策略。
--
--    record_post_view(target_post_id)：
--    - 只给"已通过、公开、没删除"的帖子计数；作者自己打开不算。
--    - 没登录的游客打开也算（auth.uid() 为 null）。
--    - 同一个人反复刷新的去重在前端做（同一台手机同一篇帖子一天只调一次），
--      这里不建明细表，保持简单。
--
-- 是否影响现有数据：不影响。新表一开始是空的，所有帖子浏览次数从 0 开始。
--
-- 回滚（默认不执行）：
--   drop function if exists public.record_post_view(uuid);
--   drop table if exists public.post_view_counts;
--   alter table public.posts drop constraint if exists posts_salary_unit_check;
--   alter table public.posts add constraint posts_salary_unit_check
--     check (salary_unit is null or salary_unit in ('hour', 'day', 'month', 'year'));

-- ---------------------------------------------------------------------------
-- 1. 周薪
-- ---------------------------------------------------------------------------

alter table public.posts drop constraint if exists posts_salary_unit_check;
alter table public.posts
  add constraint posts_salary_unit_check
    check (salary_unit is null or salary_unit in ('hour', 'day', 'week', 'month', 'year'));

comment on column public.posts.salary_unit is
  '工作帖的薪资单位：hour/day/week/month/year（发布页只给 hour/week/month）；数字在 price_amount，面议写在 price_label。其它分类为 null。';

-- ---------------------------------------------------------------------------
-- 2. 浏览次数
-- ---------------------------------------------------------------------------

create table if not exists public.post_view_counts (
  post_id uuid primary key references public.posts (id) on delete cascade,
  view_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.post_view_counts is
  '分类信息帖子的浏览次数。只有帖子作者和管理员能读；只能通过 record_post_view() 增加。';

alter table public.post_view_counts enable row level security;
revoke all on public.post_view_counts from anon, authenticated;
grant select on public.post_view_counts to authenticated;

drop policy if exists post_view_counts_select_author_or_admin on public.post_view_counts;
create policy post_view_counts_select_author_or_admin
  on public.post_view_counts
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.posts p
       where p.id = post_view_counts.post_id
         and p.author_id = auth.uid()
    )
  );

create or replace function public.record_post_view(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select p.author_id into v_author_id
    from public.posts p
   where p.id = target_post_id
     and p.status = 'approved'
     and p.visibility = 'public'
     and p.deleted_at is null;

  -- 帖子不存在 / 没公开：什么都不做，也不报错（打开详情页不应该因为计数失败出错）。
  if not found then
    return;
  end if;

  -- 作者自己看不算。
  if auth.uid() is not null and auth.uid() = v_author_id then
    return;
  end if;

  insert into public.post_view_counts (post_id, view_count, updated_at)
  values (target_post_id, 1, now())
  on conflict (post_id) do update
    set view_count = public.post_view_counts.view_count + 1,
        updated_at = now();
end;
$$;

revoke all on function public.record_post_view(uuid) from public;
grant execute on function public.record_post_view(uuid) to anon, authenticated;
