-- Migration: atomic delete_post function (soft delete + moderation log)
--
-- 为什么改：
--   "删除帖子"功能，范围是能删除任何状态的帖子（不限于待审核），走软删除
--   （设置 posts.deleted_at），同样要保证"改状态 + 记审核日志"原子完成，
--   跟 approve_post/reject_post/resolve_report/dismiss_report 是同一个
--   模式。
--
-- 影响哪些表：
--   不新建表，新增一个 security definer 函数 delete_post。
--
-- 是否影响现有数据：
--   不影响，只新增函数。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 关于 action_type 用哪个值：
--   Tables.md 17.3 节列出的 action_type 里没有 delete_post，只有
--   archive_post / restore_post 这一对。用户也在指令里问了这个问题——
--   这里选 archive_post，不新造一个值，理由：这次删除帖子是软删除
--   （设置 deleted_at，不做硬删除），效果上就是把帖子从所有正常可见的
--   查询结果里移除、但保留数据可恢复，这跟"归档"的语义是一致的；而且
--   17.3 节已经配套列了 restore_post 作为它的反向操作，如果以后要做
--   "恢复已删除帖子"功能，直接对应 restore_post，不需要再纠结跟
--   delete_post 是不是要配一个新的 undelete_post。用 archive_post 能
--   完整复用文档已经设计好的这一对语义，不用额外发明新值。
--
-- 关于 posts_update_own_or_admin 是否会跟这个新函数冲突：
--   检查了 supabase/migrations/20260717000400_lock_posts_status_admin_
--   direct_update.sql 里现在的定义——上次收紧只锁了 status 这一列
--   （管理员分支的 with check 要求 status 必须跟当前值一致），完全没有
--   动 deleted_at，管理员现在依然可以通过直接 UPDATE 自由设置/清除
--   deleted_at。delete_post 是 security definer 函数，属主拥有 posts
--   表、天然绕过这条策略，不管策略里 deleted_at 现在开不开都不影响这个
--   函数能不能执行——两者不冲突。
--
--   但这里有一个跟"收紧 status"同样性质的口子，需要你决定要不要一并处理：
--   现在直接 UPDATE 这条路径依然能设置 deleted_at，管理员理论上还是可以
--   绕开 delete_post()、直接把某个帖子的 deleted_at 设成 now()，这样
--   "删除"这个动作就不会经过 delete_post 内部插入 moderation_actions 那
--   一步，日志会漏记——这跟当初 posts.status 那个口子是完全一样的问题，
--   我这次没有主动去锁 deleted_at（你这次的指令是"确认这次新函数不会跟
--   现有策略冲突"，不是"把这个口子也堵上"，所以按字面只做了确认，没有
--   动策略）。如果你希望"删除"也做成"只能通过 delete_post() 函数、
--   不给任何直接 UPDATE deleted_at 的入口"，需要专门再来一次收紧
--   posts_update_own_or_admin，思路跟上次锁 status 完全一样，告诉我一声
--   我再补一份迁移。

create or replace function public.delete_post(
  target_post_id uuid,
  delete_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := trim(both from delete_reason);
begin
  if not public.is_admin() then
    raise exception 'only admins can delete posts';
  end if;

  if v_reason is null or v_reason = '' then
    raise exception 'delete_reason is required';
  end if;

  -- 只处理还没被删除过的帖子（deleted_at is null），不限制 status——
  -- 待审核、已通过、已驳回的帖子都能删，"从未审核过的 pending 帖子"
  -- 不需要先 approve/reject 才能删，这条 where 本身就没有 status 限制，
  -- 天然满足这个要求。已经删过的帖子会被 where 条件排除，not found 分支
  -- 会报错，避免同一条帖子被重复删、重复记一遍日志。
  update public.posts
  set deleted_at = now()
  where id = target_post_id
    and deleted_at is null;

  if not found then
    raise exception 'post % is already deleted (or does not exist)', target_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), 'archive_post', 'post', target_post_id, v_reason);
end;
$$;

revoke execute on function public.delete_post(uuid, text) from public;
grant execute on function public.delete_post(uuid, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- revoke execute on function public.delete_post(uuid, text) from authenticated;
-- drop function if exists public.delete_post(uuid, text);
