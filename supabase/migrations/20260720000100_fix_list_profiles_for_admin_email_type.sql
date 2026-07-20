-- Migration: fix list_profiles_for_admin() email column type mismatch
--
-- 为什么改：
--   20260720000000_list_profiles_for_admin_function.sql 已经推送并在真实
--   浏览器验证时触发：调用这个函数返回 400，Postgres 报
--   42804 "structure of query does not match function result type" ——
--   "Returned type character varying(255) does not match expected type
--   text in column 3"。
--
--   根因：auth.users.email 这一列的实际类型是
--   character varying(255)，不是 text；函数用 `returns table (...)`
--   声明了 email 是 text 类型，`return query` 要求查询结果的列类型
--   跟声明的返回类型精确匹配（不像普通 SQL 里 varchar 赋值给 text 那样
--   会自动做隐式转换），这里没有精确匹配，所以每次调用都会失败——
--   不是权限问题，也不是 RLS 问题，是纯粹的类型声明错误，之前没有
--   在本地/测试环境里真正跑一次这个函数就发现，这次真实浏览器验证
--   才暴露出来。
--
-- 影响哪些表：
--   不新建表，只重新定义 public.list_profiles_for_admin 这一个函数
--   （用 create or replace，函数签名/参数不变，不需要 drop）。
--   20260720000000 那份迁移已经推送生效，历史迁移不改写，这是在它之上
--   的修正。
--
-- 是否影响现有数据：
--   不影响，纯查询函数，只改类型声明和一个显式类型转换。
--
-- 是否需要回滚方案：
--   需要（会重新引入这个类型不匹配的 bug，只按惯例保留，不建议真的
--   跑）。见文件末尾注释。
--
-- 修复方式：在 select 里把 u.email 显式转成 text（`u.email::text`），
-- 让查询结果的实际列类型跟函数声明的 text 精确一致。函数体其它逻辑
-- （权限检查、search_term 过滤、排序）完全不变。
create or replace function public.list_profiles_for_admin(search_term text default null)
returns table (
  id uuid,
  display_name text,
  email text,
  role text,
  account_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can list user profiles';
  end if;

  return query
    select p.id, p.display_name, u.email::text, p.role, p.account_status, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.deleted_at is null
      and (
        search_term is null
        or search_term = ''
        or p.display_name ilike '%' || search_term || '%'
        or u.email ilike '%' || search_term || '%'
      )
    order by p.created_at desc;
end;
$$;

-- 回滚方案（默认不执行，会重新引入类型不匹配的 bug，需要人工确认后
-- 单独运行）：
--
-- create or replace function public.list_profiles_for_admin(search_term text default null)
-- returns table (
--   id uuid,
--   display_name text,
--   email text,
--   role text,
--   account_status text,
--   created_at timestamptz
-- )
-- language plpgsql
-- stable
-- security definer
-- set search_path = public
-- as $$
-- begin
--   if not public.is_admin() then
--     raise exception 'only admins can list user profiles';
--   end if;
--
--   return query
--     select p.id, p.display_name, u.email, p.role, p.account_status, p.created_at
--     from public.profiles p
--     join auth.users u on u.id = p.id
--     where p.deleted_at is null
--       and (
--         search_term is null
--         or search_term = ''
--         or p.display_name ilike '%' || search_term || '%'
--         or u.email ilike '%' || search_term || '%'
--       )
--     order by p.created_at desc;
-- end;
-- $$;
