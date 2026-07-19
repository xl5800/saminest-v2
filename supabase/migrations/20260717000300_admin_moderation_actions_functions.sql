-- Migration: atomic moderation action functions (approve/reject post, resolve/dismiss report)
--
-- 为什么改：
--   后台管理员前端要做"审核帖子"和"处理举报"，每个操作都是"改一个状态 +
--   记一条 moderation_actions 审计日志"的组合。参照这个项目里 favorites
--   用触发器同步 posts.favorite_count、create_direct_conversation 用
--   security definer 函数保证"建会话 + 加两个成员"原子完成的经验，这次
--   同样封装成数据库函数，而不是让前端分两次调用（先 update 状态，再
--   insert 日志）——分两次调用没有事务保证，中途失败会出现"状态改了但
--   日志没记"或反过来的不一致状态，两次调用中间也可能被别的请求插进来。
--   单个函数内部的多条语句在同一个事务里执行，要么全成功要么全回滚，
--   不会出现半途而废的中间状态。
--
-- 影响哪些表：
--   不新建表。新增四个 security definer 函数：approve_post / reject_post /
--   resolve_report / dismiss_report，分别读写 posts 或 reports，并各自
--   写一条 moderation_actions 记录。同时收回上一份迁移
--   （20260716000200_admin_moderation_backend.sql）里给 reports 加的
--   直接 UPDATE 策略——见下面"为什么把 reports 的直接 UPDATE 策略去掉"。
--
-- 是否影响现有数据：
--   不影响，只新增函数、调整 reports 的策略。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 为什么把 reports 的直接 UPDATE 策略去掉：
--   20260717000200 迁移里按当时的要求给 reports 加了
--   reports_update_admin_only 这条直接 UPDATE 策略（管理员可以直接
--   UPDATE status/resolution_note/reviewer_id/reviewed_at 四个字段）。
--   现在要保证"改状态 + 记日志"原子完成，如果这条直接 UPDATE 策略还在，
--   管理员的前端代码理论上还是可以绕过 resolve_report/dismiss_report
--   这两个函数、直接对 reports 发一次 UPDATE，这样状态改了但不会经过
--   函数里插入 moderation_actions 那一步，日志就漏记了——直接 UPDATE
--   策略的存在本身就是对"原子性"这个目标的一个绕过口子。这份迁移直接
--   drop 掉那条策略（drop policy if exists，不管上一份迁移到底有没有
--   被推送过都能安全执行），reports 的状态变更之后只能通过
--   resolve_report / dismiss_report 这两个函数进行，不再开放任何直接
--   UPDATE 入口——这跟 conversations/conversation_members 从"开放直接
--   INSERT 策略"改成"只能通过 create_direct_conversation() 函数"是同一个
--   思路。
--
--   posts 表这次没有做同样的处理，posts_update_own_or_admin 的管理员分支
--   还是完全放开的，管理员理论上还是可以绕开 approve_post/reject_post
--   直接 UPDATE posts.status。这里特意不动它，原因是：
--     1. posts_update_own_or_admin 是很早就有的基础策略，同时承担"作者
--        改自己帖子其它字段"和"管理员软删除"（上次刚确认过这个能力）
--        两个用途，牵动面比 reports 那条新加没多久的策略大得多，这次
--        任务范围没有要求动它。
--     2. 能绕过审计日志的角色是"已登录的管理员"，不是任意用户——这是
--        内部信任边界内的绕过风险（管理员本来就有权限做这件事，只是
--        跳过了记录这一步），跟之前 conversations/reports 那些"防止
--        普通用户越权"的场景严重程度不同。
--   如果你希望 posts 也做成"只能通过函数改状态，不给任何直接 UPDATE
--   入口"，这是一个更大的改动（要从 posts_update_own_or_admin 里单独
--   摘出"改 status"这一种操作单独限制，同时不能影响它现有的其它用途），
--   需要专门讨论，这次没有做，只在这里记录这个不对称。

-- =====================================================================
-- posts 审核：approve_post / reject_post
-- =====================================================================

-- 只放行 pending -> approved，其它状态的帖子不受理（比如已经被处理过、
-- 或者已经被软删除），避免管理员并发点两次、或者对着一个早就处理完的
-- 帖子重复操作。找不到匹配的行时 update 的 row count 是 0，用
-- `if not found` 判断并报错，不静默什么都不做。
create or replace function public.approve_post(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can approve posts';
  end if;

  update public.posts
  set status = 'approved'
  where id = target_post_id
    and status = 'pending';

  if not found then
    raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id)
  values (auth.uid(), 'approve_post', 'post', target_post_id);
end;
$$;

-- rejection_note 必填（用户明确要求"不允许空原因"），trim 之后如果是
-- 空字符串或 null 都算不合法，直接报错，不会走到后面改状态那一步。
create or replace function public.reject_post(
  target_post_id uuid,
  rejection_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from rejection_note);
begin
  if not public.is_admin() then
    raise exception 'only admins can reject posts';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'rejection_note is required';
  end if;

  update public.posts
  set status = 'rejected'
  where id = target_post_id
    and status = 'pending';

  if not found then
    raise exception 'post % is not pending (already processed, or does not exist)', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'reject_post', 'post', target_post_id, v_note);
end;
$$;

-- =====================================================================
-- reports 处理：resolve_report / dismiss_report
-- =====================================================================
--
-- 两个函数都会把 reports.reviewer_id / reviewed_at 一并写上（12.2 节这两
-- 个字段本来就是给"处理管理员"和"处理时间"用的），resolution_note 必填，
-- 跟 reject_post 一样的校验方式。target_type 这里用 'report'（moderation_
-- actions 记录的是"对举报本身做了处理"这个动作，而不是举报指向的那个
-- 对象），target_id 是举报记录自己的 id。只受理 pending/reviewing
-- （非终结状态）的举报，已经是 resolved/dismissed 的不再受理。

create or replace function public.resolve_report(
  target_report_id uuid,
  resolution_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from resolution_note);
begin
  if not public.is_admin() then
    raise exception 'only admins can resolve reports';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'resolution_note is required';
  end if;

  update public.reports
  set status = 'resolved',
      resolution_note = v_note,
      reviewer_id = auth.uid(),
      reviewed_at = now()
  where id = target_report_id
    and status in ('pending', 'reviewing');

  if not found then
    raise exception 'report % is not pending/reviewing (already processed, or does not exist)', target_report_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'resolve_report', 'report', target_report_id, v_note);
end;
$$;

create or replace function public.dismiss_report(
  target_report_id uuid,
  resolution_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := trim(both from resolution_note);
begin
  if not public.is_admin() then
    raise exception 'only admins can dismiss reports';
  end if;

  if v_note is null or v_note = '' then
    raise exception 'resolution_note is required';
  end if;

  update public.reports
  set status = 'dismissed',
      resolution_note = v_note,
      reviewer_id = auth.uid(),
      reviewed_at = now()
  where id = target_report_id
    and status in ('pending', 'reviewing');

  if not found then
    raise exception 'report % is not pending/reviewing (already processed, or does not exist)', target_report_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'dismiss_report', 'report', target_report_id, v_note);
end;
$$;

-- 显式收紧/授予执行权限，四个函数都只给登录用户（游客不可能是管理员，
-- 函数内部的 is_admin() 检查本身也会挡住非管理员，这里的 grant/revoke
-- 是双重保险，不依赖 Postgres 默认的 PUBLIC 执行权限）。
revoke execute on function public.approve_post(uuid) from public;
revoke execute on function public.reject_post(uuid, text) from public;
revoke execute on function public.resolve_report(uuid, text) from public;
revoke execute on function public.dismiss_report(uuid, text) from public;

grant execute on function public.approve_post(uuid) to authenticated;
grant execute on function public.reject_post(uuid, text) to authenticated;
grant execute on function public.resolve_report(uuid, text) to authenticated;
grant execute on function public.dismiss_report(uuid, text) to authenticated;

-- 收回 reports 的直接 UPDATE 策略（原因见文件开头说明）。
drop policy if exists reports_update_admin_only on public.reports;

-- 回滚方案（默认不执行，会重新引入直接 UPDATE 权限，需要人工确认后
-- 单独运行）：
--
-- create policy reports_update_admin_only
--   on public.reports
--   for update
--   to authenticated
--   using (public.is_admin())
--   with check (
--     public.is_admin()
--     and reporter_id = (select r.reporter_id from public.reports r where r.id = reports.id)
--     and target_type = (select r.target_type from public.reports r where r.id = reports.id)
--     and target_id = (select r.target_id from public.reports r where r.id = reports.id)
--     and reason_code = (select r.reason_code from public.reports r where r.id = reports.id)
--     and description is not distinct from (select r.description from public.reports r where r.id = reports.id)
--     and created_at = (select r.created_at from public.reports r where r.id = reports.id)
--   );
--
-- revoke execute on function public.dismiss_report(uuid, text) from authenticated;
-- revoke execute on function public.resolve_report(uuid, text) from authenticated;
-- revoke execute on function public.reject_post(uuid, text) from authenticated;
-- revoke execute on function public.approve_post(uuid) from authenticated;
--
-- drop function if exists public.dismiss_report(uuid, text);
-- drop function if exists public.resolve_report(uuid, text);
-- drop function if exists public.reject_post(uuid, text);
-- drop function if exists public.approve_post(uuid);
