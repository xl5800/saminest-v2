-- Migration: self-service account deletion (15-day revocable grace period)
--
-- 为什么改：
--   "我的 → 设置 → 注销账号"功能：用户自助发起注销，进入 15 天可撤销的
--   缓冲期；缓冲期内账号完全正常使用（不额外限制发帖/私信/收藏，这次
--   跟 Barry 确认过，故意不复用 is_account_restricted() 那套限制）；缓冲期
--   到期后由 pg_cron 每日定时任务自动执行真正的清除。
--
--   清除方式参照 docs/03_Database/Tables.md 第 19 节"用户删除"既定方案，
--   但对 profiles 表做了一处必要偏离（"账号注销功能——验证与上线准备"
--   这次任务在本地真实环境验证时发现、已同步更新到第 19/37 节文档）：
--     account_status = deleted
--   profiles 不物理删除，也不设置 profiles.deleted_at——那一列从建表迁移
--   起就是 profiles_select_public_or_self 这条 RLS 策略的可见性开关
--   （using (deleted_at is null or id = auth.uid())），设置它会让这一行
--   对除本人以外的所有人（含匿名访客）永久隐藏（本人清除后已经不可能
--   再登录，id = auth.uid() 分支永远不会再成立），直接导致
--   posts.author:profiles(display_name) 这类联表查询拿到 null，而不是
--   "已注销用户"——用真实 anon 角色请求在本地 Supabase 复现验证过，不是
--   理论推测。posts.author_id 等外键最终都追溯到 profiles.id（无 on
--   delete cascade/set null），物理删掉 profiles 这一行会直接报外键错误，
--   或者需要级联处理，都不符合"用户内容是否保留、匿名化或删除，应根据
--   隐私规则处理"的要求。这里选择保留帖子/消息内容、只把作者身份匿名化
--   （display_name 换成占位文案，avatar/bio/location 清空）。
--
-- 影响哪些表：
--   新建 public.account_deletion_requests（记录每次注销请求的发起/撤销/
--   执行时间，是否处于缓冲期由这张表的行是否存在且未撤销/未执行判断）。
--   新增三个函数：
--     - public.request_account_deletion()：本人发起注销，security definer，
--       grant 给 authenticated。
--     - public.cancel_account_deletion()：本人撤销注销，security definer，
--       grant 给 authenticated。
--     - public.purge_expired_account_deletions()：真正执行清除，security
--       definer，只给 pg_cron 调度调用，不 grant 给 authenticated/anon，
--       防止被前端直接 .rpc() 调用绕过缓冲期。
--   启用 pg_cron 扩展（项目此前未用过，list_extensions 确认
--   default_version 1.6.4、installed_version 为空，即"可装未装"），注册
--   一个每日调度任务调用 purge_expired_account_deletions()。
--
-- 是否影响现有数据：
--   不影响，新增表和函数，不改动任何现有表结构/策略。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 关于缓冲期时长：
--   15 天，硬编码在 request_account_deletion() 里（这次跟 Barry 确认过的
--   值）。不做成可配置参数——这跟 posts_title_length_check 那些验证阈值
--   一样，属于会变但不常变的产品规则，以后要改就直接改这个函数体、重新
--   提交一份 migration，没必要为一个几乎不会在运行时变化的值增加配置表
--   或环境变量这层间接。
--
-- 关于 auth.users 处理方式的选择（这次跟 Barry 确认过，选"纯 SQL 方案"，
-- 不新增 Edge Function）：
--   Supabase 官方支持的用户软删除是 supabase-js 的
--   `auth.admin.deleteUser(id, true)`，但这个调用需要 service_role key，
--   只能在服务端（Edge Function 或其他后端）发起，而这个项目目前是纯
--   SPA + Postgres migration，没有 supabase/functions 目录，也没有 Vercel
--   API route（package.json 里的 @vercel/functions 目前只服务于根目录
--   middleware.ts 这个 Edge Middleware，不是通用的服务端函数层）。为了
--   不为这一个功能新增部署环节和一份需要托管的 service_role 密钥，这里
--   改为在 security definer 函数内直接用 SQL 复刻同等效果：清空
--   auth.users 的登录凭据字段（email/phone/encrypted_password/
--   raw_user_meta_data）、置 auth.users.deleted_at，并删除对应的
--   session/refresh_token 行，让这个账号确实无法再登录，同时不删除
--   auth.users 这一行本身（profiles.id 外键约束不允许，见上面的说明）。
--
--   已用 execute_sql 核对过目标环境（project kdpzbpapnufvgbfgjgcr）：
--     - auth.users 确有 deleted_at / email / phone / encrypted_password /
--       raw_user_meta_data 这几列。
--     - postgres 角色对 auth.users / auth.sessions / auth.refresh_tokens
--       三张表都有 SELECT/INSERT/UPDATE/DELETE 权限。
--   这两点是这个方案能不能跑通的前提，已经确认过，不是假设。
--
--   仍然建议：这个函数改动了登录凭据和 Session（AI-Development.md 第 22
--   节"安全相关任务"里明确点名的两类），先在 Supabase 分支/预发环境用
--   现成的 QA 测试账号跑一遍完整流程（发起注销 → 手动把
--   scheduled_purge_at 改到过去 → 手动调用一次 purge_expired_account_
--   deletions() → 确认该账号确实无法再登录、profiles 已匿名化、其历史
--   帖子/消息仍正常显示"已注销用户"），再考虑让 pg_cron 定时任务在生产
--   环境跑起来。

-- =====================================================================
-- 1. account_deletion_requests 表
-- =====================================================================

-- user_id 不是主键——本地真实验证时发现，如果 user_id 直接当主键，一个
-- 用户"发起注销 → 撤销"之后，这一行（cancelled_at 已经有值）会永远占着
-- user_id 这个主键值，以后这个用户想再次发起注销，INSERT 会直接撞主键
-- 唯一约束报 23505，而不是 request_account_deletion() 里那句"an account
-- deletion request is already pending"的友好错误——用户撤销一次之后就
-- 永久失去了再次注销的能力，这明显不是"撤销"这个功能该有的语义（撤销应该
-- 让账号完全回到可以重新发起注销的正常状态）。改成独立的 id 主键 + 一条
-- 只覆盖"当前仍待处理"这一种行的部分唯一索引（cancelled_at is null and
-- purged_at is null），跟 reports 表的
-- reports_reporter_active_target_unique_idx（"同一举报人对同一目标最多
-- 一条未结束的举报，但允许有多条历史记录"）是同一个模式——一个用户一生
-- 可以有多条注销请求历史（每次都是"发起又撤销"），但任意时刻最多只有一条
-- 处于"待处理"状态。
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  scheduled_purge_at timestamptz not null,
  cancelled_at timestamptz null default null,
  purged_at timestamptz null default null,

  constraint account_deletion_requests_purge_after_request_check
    check (scheduled_purge_at > requested_at)
);

comment on table public.account_deletion_requests is
  '账号自助注销请求：记录发起/撤销/清除时间；缓冲期内账号使用不受影响，
   参见 docs/03_Database/Tables.md 第 19 节"用户删除"。一个用户一生可以有
   多条历史记录（每次发起+撤销算一条），但任意时刻最多一条处于待处理
   状态，见 account_deletion_requests_user_pending_unique_idx。';

-- 任意时刻每个用户最多一条"待处理"（未撤销、未清除）的请求——这是这张表
-- 真正的业务唯一性约束，见上面表定义处的说明。
create unique index account_deletion_requests_user_pending_unique_idx
  on public.account_deletion_requests (user_id)
  where cancelled_at is null and purged_at is null;

-- 定时任务扫描"到期未撤销未清除"的请求用；部分索引只覆盖这一种查询，
-- 比对全表加索引更小。
create index account_deletion_requests_pending_purge_idx
  on public.account_deletion_requests (scheduled_purge_at)
  where cancelled_at is null and purged_at is null;

alter table public.account_deletion_requests enable row level security;

-- 只允许本人读取自己的注销请求状态（/设置/注销账号页面用来判断"当前是否
-- 处于缓冲期、还剩几天"）。写入一律走下面两个 security definer 函数，
-- 不给 authenticated/anon 任何 insert/update/delete 策略——这跟
-- moderation_actions 表"只有函数能写、没有直接写入策略"是同一个模式。
create policy account_deletion_requests_select_self
  on public.account_deletion_requests
  for select
  to authenticated
  using (user_id = auth.uid());

-- =====================================================================
-- 2. 本人发起注销：request_account_deletion()
-- =====================================================================
--
-- 已存在一条未撤销未清除的请求时报错，不做成"更新已有请求的
-- scheduled_purge_at"这种静默覆盖——前端在发起前应该先用
-- account_deletion_requests_select_self 这条策略查一次当前状态，只在没有
-- 待处理请求时才展示"注销账号"按钮，这里的报错只是防御性兜底（比如同一个
-- 账号开了两个标签页同时点击）。

create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_purge_at timestamptz := now() + interval '15 days';
begin
  if v_user_id is null then
    raise exception 'request_account_deletion requires an authenticated user';
  end if;

  if exists (
    select 1
    from public.account_deletion_requests
    where user_id = v_user_id
      and cancelled_at is null
      and purged_at is null
  ) then
    raise exception 'an account deletion request is already pending';
  end if;

  insert into public.account_deletion_requests (user_id, scheduled_purge_at)
  values (v_user_id, v_scheduled_purge_at);

  return v_scheduled_purge_at;
end;
$$;

revoke execute on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- =====================================================================
-- 3. 本人撤销注销：cancel_account_deletion()
-- =====================================================================

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'cancel_account_deletion requires an authenticated user';
  end if;

  update public.account_deletion_requests
  set cancelled_at = now()
  where user_id = v_user_id
    and cancelled_at is null
    and purged_at is null;

  if not found then
    raise exception 'no pending account deletion request found';
  end if;
end;
$$;

revoke execute on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- =====================================================================
-- 4. 定时清除：purge_expired_account_deletions()
-- =====================================================================
--
-- 只给 pg_cron 调用，不 grant 给 authenticated/anon——防止被前端绕过
-- 缓冲期直接调用。逐个用户跑（游标），不是一条批量 update：因为每个用户
-- 要连带处理 profiles / auth.users / auth.sessions / auth.refresh_tokens
-- 四张表，用游标逐个跑，将来如果某个用户处理失败，日志和排查都更容易
-- 定位到具体是哪个 user_id 出的问题，不会因为一条语句报错就导致同一批
-- 里其他人也处理不了（这里没有加显式 exception handler 吞掉单个失败继续
-- 下一个——先跑通最简单版本，如果实践中真的遇到某个用户处理失败卡住
-- 整批，再补 begin/exception 逐条 continue，属于"先用最小实现验证跑得通、
-- 再按实际问题加健壮性"，不是遗漏）。

create or replace function public.purge_expired_account_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, user_id
    from public.account_deletion_requests
    where cancelled_at is null
      and purged_at is null
      and scheduled_purge_at <= now()
  loop
    -- 故意不设置 profiles.deleted_at——这一列从 create_profiles_table 迁移
    -- 起就是 profiles_select_public_or_self 这条 RLS 策略的可见性开关
    -- （using (deleted_at is null or id = auth.uid())），一旦设成非 null，
    -- 这一行会对除本人以外的所有人（含匿名访客）从 SELECT 结果里消失——
    -- 而这个账号本来就再也登录不进去了（auth.users 的凭据已经清空），
    -- id = auth.uid() 这个分支永远不会再成立，等于永久对所有人隐藏。
    -- 这直接违反了这份 migration 顶部注释和"验证与上线准备"任务卡都明确
    -- 要求的"历史帖子/消息仍正常显示、作者显示已注销用户"——本地验证时
    -- 用真实的 anon 角色查询复现过：设置 deleted_at 后帖子的
    -- author:profiles(display_name) 联表结果直接是 null，不是"已注销
    -- 用户"文案。account_status = 'deleted' 本身就是从最初建表迁移起就
    -- 保留、专门给这种场景用的取值（check 约束里一直有，只是在这份
    -- migration 之前从没被真正用过），已经足够标记"这是一个已关闭的账号"，
    -- 不需要再叠加一个会连带影响可见性的 deleted_at。
    update public.profiles
    set display_name = '已注销用户',
        avatar_url = null,
        bio = null,
        location_id = null,
        account_status = 'deleted'
    where id = r.user_id;

    -- auth.refresh_tokens.user_id 是 varchar，不是 uuid，这里显式转换。
    update auth.users
    set email = null,
        phone = null,
        encrypted_password = null,
        raw_user_meta_data = '{}'::jsonb,
        deleted_at = now()
    where id = r.user_id;

    delete from auth.sessions where user_id = r.user_id;
    delete from auth.refresh_tokens where user_id = r.user_id::text;

    -- 按行的 id（不是 user_id）精确定位这一条——现在 user_id 不再是主键，
    -- 同一个用户理论上可能有多条历史行（每次发起+撤销算一条），只是这
    -- 一条 for 循环选出来的、当前真正待处理的行应该被标记为已清除，不能
    -- 用 user_id 广泛匹配，否则会连带把这个用户更早、已经撤销过的历史行
    -- 也误标成"已清除"（虽然那些历史行 cancelled_at 已经有值，语义上不
    -- 应该再被 purged_at 覆盖）。
    update public.account_deletion_requests
    set purged_at = now()
    where id = r.id;
  end loop;
end;
$$;

revoke execute on function public.purge_expired_account_deletions()
  from public, authenticated, anon;

-- =====================================================================
-- 5. pg_cron：每日调度
-- =====================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-account-deletions',
  '0 10 * * *', -- 每天 UTC 10:00（美东 05:00/06:00，视夏令时），挑一个
                -- DMV 用户活跃度低的时段跑
  $$select public.purge_expired_account_deletions();$$
);

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- select cron.unschedule('purge-expired-account-deletions');
-- revoke execute on function public.purge_expired_account_deletions() from public, authenticated, anon;
-- drop function if exists public.purge_expired_account_deletions();
-- revoke execute on function public.cancel_account_deletion() from authenticated;
-- drop function if exists public.cancel_account_deletion();
-- revoke execute on function public.request_account_deletion() from authenticated;
-- drop function if exists public.request_account_deletion();
-- drop policy if exists account_deletion_requests_select_self on public.account_deletion_requests;
-- drop index if exists account_deletion_requests_pending_purge_idx;
-- drop table if exists public.account_deletion_requests;
-- -- 如果 pg_cron 扩展是本迁移新启用的且没有其它任务在用，可选择性 drop：
-- -- drop extension if exists pg_cron;
