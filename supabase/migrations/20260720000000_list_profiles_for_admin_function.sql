-- Migration: list_profiles_for_admin() function for the account management UI
--
-- 为什么改：
--   后台账号管理页面需要展示"昵称、邮箱、角色、账号状态"。email 存在
--   auth.users 表里，不在 public.profiles 里；supabase/config.toml 的
--   api.schemas 只暴露了 public / graphql_public 两个 schema
--   （`schemas = ["public", "graphql_public"]`），前端没有任何直接途径
--   查询 auth.users——这不是这次前端任务范围内能解决的问题，需要一个
--   security definer 函数在服务端把 public.profiles 和 auth.users
--   join 好、只返回后台需要的字段。
--
-- 影响哪些表：
--   不新建表，新增一个 security definer 函数 list_profiles_for_admin，
--   读取 public.profiles 和 auth.users（只读，不修改任何数据）。
--
-- 是否影响现有数据：
--   不影响，纯查询函数。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 设计说明：
--   - 只返回账号管理页面需要的字段（id/display_name/email/role/
--     account_status/created_at），不返回 auth.users 里其它敏感字段
--     （加密密码、手机号等），也不返回 profiles 里跟这次任务无关的字段
--     （bio/avatar_url 等）——最小化暴露面。
--   - 排除 deleted_at 不为空的账号（已注销的账号不需要出现在"封禁管理"
--     这个场景里，deleted 状态这次也明确不用管）。
--   - search_term 可选，按 display_name 或 email 做不区分大小写的模糊
--     匹配，为空则返回全部——这是产品说的"如果搜索比较复杂可以先只做
--     列表"里"不复杂"的那一半，成本只是一个 ilike 条件，顺手做了。
--   - 函数内部显式检查 is_admin()，不是只靠 grant 控制谁能调用——因为
--     这个函数一旦能被非管理员调用，就会把所有用户的邮箱暴露出去，
--     这是要重点防的数据泄露面，双重保险（grant 只给 authenticated，
--     函数体内再挡一次非管理员）。
--   - 不做服务端分页——当前用户规模很小，返回全量列表足够用；如果以后
--     用户量变大，需要在这个函数上加 limit/offset，这次不做，是刻意的
--     简化，不是遗漏。
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
    select p.id, p.display_name, u.email, p.role, p.account_status, p.created_at
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

revoke execute on function public.list_profiles_for_admin(text) from public;
grant execute on function public.list_profiles_for_admin(text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- revoke execute on function public.list_profiles_for_admin(text) from authenticated;
-- drop function if exists public.list_profiles_for_admin(text);
