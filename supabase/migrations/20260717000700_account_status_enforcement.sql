-- Migration: enforce account_status (restricted/suspended) + admin set_account_status function
--
-- 为什么改：
--   封禁账号功能完整版：restricted 拦"输出类"行为（发帖/发消息/举报/
--   联系发布者），suspended 在此基础上再拦收藏；管理员需要一个原子的
--   "改 account_status + 记审核日志"入口。对应盘点报告确认的三个缺口：
--   posts_insert_own / favorites_insert_own / reports_insert_own /
--   messages_insert_own_as_active_member / create_direct_conversation()
--   都没有 account_status 检查；profiles 表没有任何管理员改
--   account_status 的入口；没有现成的账号状态判断辅助函数。
--
-- 影响哪些表：
--   不新建表。新增三个 security definer 函数
--   （is_account_restricted / is_account_suspended / set_account_status），
--   重建 posts_insert_own / favorites_insert_own / reports_insert_own /
--   messages_insert_own_as_active_member 四条策略，重新定义
--   create_direct_conversation()，并给 moderation_actions.action_type
--   的 check 约束加一个新取值 restore_user（原因见下）。
--
-- 是否影响现有数据：
--   不影响，所有改动只针对策略/函数/约束定义。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

-- =====================================================================
-- 1. 账号状态判断辅助函数
-- =====================================================================
--
-- 两个独立的布尔谓词，不是一个返回 account_status 文本的函数——理由：
-- "restricted 或 suspended 都算受限"这个取值列表要在五个不同的地方复用
-- （posts/favorites/reports/messages 四条策略 + create_direct_conversation
-- 函数），把这份取值列表放进一个函数内部，以后如果这份列表要调整（比如
-- 以后 Tables.md 又加了新的账号状态），只需要改这一处，而不是改五处
-- 调用点各自的 "in (...)" 列表。而且两个独立布尔谓词能直接嵌进
-- with check / if 判断里用，跟 is_admin() 已经建立的"单一职责布尔谓词"
-- 风格一致，不需要每个调用点自己再解析一次状态文本。
--
-- 命名直接对应 profiles.account_status 的两个取值（restricted /
-- suspended），看函数名就能猜到判断的是哪个数据库值，不需要额外解释。

-- 是否处于限制状态：restricted 或 suspended 都算——suspended 语义上是
-- "更严重的限制"，所以理所当然也应该被"限制状态"这个判断覆盖到。
create or replace function public.is_account_restricted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status in ('restricted', 'suspended')
  );
$$;

-- 是否被完全封禁：只有 suspended 才算，用于比 is_account_restricted()
-- 更严格的场景（这次是收藏）。
create or replace function public.is_account_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'suspended'
  );
$$;

-- =====================================================================
-- 2. 接入五处 INSERT 检查
-- =====================================================================

-- posts：restricted/suspended 都不能发帖。
drop policy if exists posts_insert_own on public.posts;

create policy posts_insert_own
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_admin() or status in ('draft', 'pending'))
    and not public.is_account_restricted()
  );

-- favorites：只有 suspended 才拦，restricted 用户仍然可以收藏（产品
-- 规则明确写了"但仍可以收藏、浏览"）。
drop policy if exists favorites_insert_own on public.favorites;

create policy favorites_insert_own
  on public.favorites
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_account_suspended()
  );

-- reports：restricted/suspended 都不能举报。
drop policy if exists reports_insert_own on public.reports;

create policy reports_insert_own
  on public.reports
  for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and not public.is_account_restricted()
  );

-- messages：restricted/suspended 都不能发消息。这是当前生效的定义
-- （上一次 RLS 递归修复迁移里重建过一次，这里在那个版本基础上加限制，
-- 不是回退到最早 20260716000400 里的写法）。
drop policy if exists messages_insert_own_as_active_member on public.messages;

create policy messages_insert_own_as_active_member
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_conversation_member(messages.conversation_id)
    and not public.is_account_restricted()
  );

-- create_direct_conversation()：这是 plpgsql 函数，不是 RLS 策略，加一个
-- 显式 if 判断，放在最前面（跟"必须登录"那个判断挨在一起），未通过直接
-- 报错，不需要走到后面的帖子查找逻辑。函数签名没变，用 create or replace
-- 直接重定义函数体即可，不需要像策略那样先 drop。
create or replace function public.create_direct_conversation(target_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_seller_id uuid;
  v_conversation_id uuid;
begin
  if v_buyer_id is null then
    raise exception 'create_direct_conversation requires an authenticated user';
  end if;

  if public.is_account_restricted() then
    raise exception 'restricted accounts cannot start a direct conversation';
  end if;

  select author_id into v_seller_id
  from public.posts
  where id = target_post_id
    and deleted_at is null;

  if v_seller_id is null then
    raise exception 'post % not found', target_post_id;
  end if;

  if v_seller_id = v_buyer_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  insert into public.conversations (type, post_id, created_by)
  values ('direct', target_post_id, v_buyer_id)
  on conflict (post_id, created_by)
    where type = 'direct' and deleted_at is null
  do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id into v_conversation_id
    from public.conversations
    where post_id = target_post_id
      and created_by = v_buyer_id
      and type = 'direct'
      and deleted_at is null;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (v_conversation_id, v_buyer_id),
    (v_conversation_id, v_seller_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

-- =====================================================================
-- 3. 管理员设置账号状态：set_account_status()
-- =====================================================================
--
-- 关于"解封"用哪个 action_type 的说明：
--   Tables.md 17.3 节列出了 restrict_user / suspend_user，但没有列出
--   对应的"解封"（改回 active）的值——这是文档的一个小缺口，类似当初
--   "没有公告表"那种情况。这里选择新增一个值 restore_user，理由：
--     - 17.3 节已经给 posts 那一对建立了 archive_post / restore_post 的
--       "动作 / 反向动作"命名惯例，restrict_user / suspend_user 需要一个
--       对应的反向动作时，跟着这个惯例叫 restore_user 是最自然的延续，
--       不需要发明新的命名风格。
--     - 如果反过来"复用 restrict_user 或 suspend_user 表示解封"，以后
--       任何人翻审核日志看到 action_type = restrict_user，都会合理地
--       以为这行是"对某人施加了限制"，而不会想到还要打开 note 字段才能
--       判断这次到底是限制还是解封——审计日志的可读性会变差，这是要
--       尽量避免的。
--     - action_type 是 text + check 约束，不是数据库原生枚举类型，加一
--       个新取值只是改一下 check 约束里的列表，成本很低，不需要什么
--       复杂的迁移步骤。
--   action_type 的选择只看"这次要把状态设成什么"，不看"改之前是什么
--   状态"：设成 restricted 一律记 restrict_user，设成 suspended 一律记
--   suspend_user，设成 active 一律记 restore_user——不区分"从 active
--   降级"还是"从 suspended 降级到 restricted"这种转移路径，这跟
--   approve_post/reject_post 只看目标状态、不看转移路径是同一个原则。
--
-- check 约束不能直接改，要先 drop 再重新 add。
alter table public.moderation_actions
  drop constraint moderation_actions_action_type_check;

alter table public.moderation_actions
  add constraint moderation_actions_action_type_check
    check (action_type in (
      'approve_post', 'reject_post', 'archive_post', 'restore_post',
      'restrict_user', 'suspend_user', 'restore_user',
      'resolve_report', 'dismiss_report'
    ));

-- 函数本身：
--   - 只允许设成 active / restricted / suspended 三个值，deleted 不在
--     这次封禁功能范围内（产品已经明确"这次不用管"），显式拒绝，不是
--     漏掉。
--   - reason 必填，trim 后为空报错，跟 reject_post/delete_post 同一个
--     模式。
--   - 不能对自己执行（管理员不能把自己封禁/解封），参照
--     create_direct_conversation 里"不能联系自己"的防御性检查思路。
--   - 只处理"状态确实发生变化"的情况（跟当前值一样就报错），防止重复
--     操作产生冗余日志，是 approve_post/delete_post 那种"只处理预期
--     前置状态"模式的自然延伸——这里的"预期前置状态"就是"和目标值不同"。
create or replace function public.set_account_status(
  target_user_id uuid,
  new_account_status text,
  status_change_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := trim(both from status_change_reason);
  v_action_type text;
begin
  if not public.is_admin() then
    raise exception 'only admins can change account status';
  end if;

  if v_reason is null or v_reason = '' then
    raise exception 'status_change_reason is required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot change your own account status';
  end if;

  if new_account_status not in ('active', 'restricted', 'suspended') then
    raise exception 'invalid account status: %', new_account_status;
  end if;

  v_action_type := case new_account_status
    when 'restricted' then 'restrict_user'
    when 'suspended' then 'suspend_user'
    when 'active' then 'restore_user'
  end;

  update public.profiles
  set account_status = new_account_status
  where id = target_user_id
    and account_status <> new_account_status;

  if not found then
    raise exception
      'profile % not found, or already has account_status %',
      target_user_id, new_account_status;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, note)
  values (auth.uid(), v_action_type, 'user', target_user_id, v_reason);
end;
$$;

revoke execute on function public.set_account_status(uuid, text, text) from public;
grant execute on function public.set_account_status(uuid, text, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- revoke execute on function public.set_account_status(uuid, text, text) from authenticated;
-- drop function if exists public.set_account_status(uuid, text, text);
--
-- alter table public.moderation_actions drop constraint moderation_actions_action_type_check;
-- alter table public.moderation_actions add constraint moderation_actions_action_type_check
--   check (action_type in (
--     'approve_post', 'reject_post', 'archive_post', 'restore_post',
--     'restrict_user', 'suspend_user', 'resolve_report', 'dismiss_report'
--   ));
--
-- create or replace function public.create_direct_conversation(target_post_id uuid)
-- returns uuid
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_buyer_id uuid := auth.uid();
--   v_seller_id uuid;
--   v_conversation_id uuid;
-- begin
--   if v_buyer_id is null then
--     raise exception 'create_direct_conversation requires an authenticated user';
--   end if;
--
--   select author_id into v_seller_id
--   from public.posts
--   where id = target_post_id
--     and deleted_at is null;
--
--   if v_seller_id is null then
--     raise exception 'post % not found', target_post_id;
--   end if;
--
--   if v_seller_id = v_buyer_id then
--     raise exception 'cannot start a direct conversation with yourself';
--   end if;
--
--   insert into public.conversations (type, post_id, created_by)
--   values ('direct', target_post_id, v_buyer_id)
--   on conflict (post_id, created_by)
--     where type = 'direct' and deleted_at is null
--   do nothing
--   returning id into v_conversation_id;
--
--   if v_conversation_id is null then
--     select id into v_conversation_id
--     from public.conversations
--     where post_id = target_post_id
--       and created_by = v_buyer_id
--       and type = 'direct'
--       and deleted_at is null;
--   end if;
--
--   insert into public.conversation_members (conversation_id, user_id)
--   values
--     (v_conversation_id, v_buyer_id),
--     (v_conversation_id, v_seller_id)
--   on conflict (conversation_id, user_id) do nothing;
--
--   return v_conversation_id;
-- end;
-- $$;
--
-- drop policy if exists messages_insert_own_as_active_member on public.messages;
-- create policy messages_insert_own_as_active_member
--   on public.messages
--   for insert
--   to authenticated
--   with check (
--     sender_id = auth.uid()
--     and public.is_active_conversation_member(messages.conversation_id)
--   );
--
-- drop policy if exists reports_insert_own on public.reports;
-- create policy reports_insert_own
--   on public.reports
--   for insert
--   to authenticated
--   with check (reporter_id = auth.uid());
--
-- drop policy if exists favorites_insert_own on public.favorites;
-- create policy favorites_insert_own
--   on public.favorites
--   for insert
--   to authenticated
--   with check (user_id = auth.uid());
--
-- drop policy if exists posts_insert_own on public.posts;
-- create policy posts_insert_own
--   on public.posts
--   for insert
--   to authenticated
--   with check (
--     author_id = auth.uid()
--     and (public.is_admin() or status in ('draft', 'pending'))
--   );
--
-- drop function if exists public.is_account_suspended();
-- drop function if exists public.is_account_restricted();
