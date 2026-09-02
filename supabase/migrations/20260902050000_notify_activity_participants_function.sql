-- Migration: notify_activity_participants() — 发起人群发通知给已加入的参与者
--
-- 为什么改：
--   任务卡 4：活动详情页给发起人加一个"📢通知参与者"入口，发起人写一段话，
--   群发给这场活动当前所有已加入（approved 且未取消）的参与者——每个人
--   各自收到一条，出现在发起人和这个参与者之间已有/新建的那条 1:1 会话里
--   （不是群聊）。
--
--   校验、会话获取/创建、拉黑跳过这几件事都必须在数据库这一层做，不能只
--   在前端拦：
--   - "只有发起人能群发"必须是服务端强制的权限检查，不能靠前端隐藏按钮
--     兜底（AI-Development.md 8.5"不使用前端保护敏感操作"，私聊场景本身
--     也在 22 节"安全相关任务"名单里）。
--   - 拿到/建出"发起人 ↔ 某个参与者"的 1:1 会话，只能走
--     security definer 函数——conversations/conversation_members 两张表
--     没有对 authenticated 开放任何直接 INSERT 的 RLS 策略（见
--     20260815182042_create_activity_conversation_function.sql 顶部
--     说明），前端没有任何合法路径能自己插这两张表。
--   - 拉黑关系的判断（is_blocked_with）同理必须在服务端做，且要精确到
--     "这一个参与者"，不能笼统地在前端查一次"我有没有屏蔽名单"就搬过来
--     用——服务端已经有现成、经过安全收紧的实现可以复用。
--
-- 具体怎么复用已有逻辑（不修改任何已有函数）：
--   1. 会话获取/创建：不直接调用 create_activity_conversation(uuid)——那个
--      函数假设"调用者是申请人、对方是活动发起人"这个方向，这次反过来是
--      "调用者是发起人、对方是某个参与者"，直接调用会在
--      `v_organizer_id = v_actor_id` 这一步报"cannot start a direct
--      conversation with yourself"（调用者查出来的组织者就是它自己）。
--      改成直接调用 create_activity_conversation 内部实际在用的同一个
--      共享辅助函数 get_or_create_direct_conversation(p_actor_id,
--      p_other_user_id, p_new_origin_type)（见
--      20260825044820_unify_direct_conversation_lookup_and_reference_messages.sql /
--      20260826162616_remove_conversation_reference_messages.sql，
--      create_activity_conversation 现在的函数体就是"校验完身份 → 调用
--      这个共享函数 → 返回"，这里等于原样复用它内部那一步"先查后插"逻辑，
--      只是把 (actor, other) 这一对参数换成 (organizer, participant)）。
--      这个共享函数本身内置了 is_blocked_with() 拉黑检查——传入的两个
--      id 之间任一方向存在屏蔽关系就会抛异常，天然满足"跟发起人有拉黑
--      关系的参与者要跳过"这条要求，不需要在这份新函数里重新写一遍拉黑
--      判断。
--      get_or_create_direct_conversation/find_direct_conversation_between/
--      create_direct_conversation_row 三个函数当前的执行权限是
--      "只 revoke，没有 grant 给任何角色"（见
--      20260825044902_lock_down_internal_conversation_helper_functions.sql），
--      跟 notify_user() 依赖的机制完全一样：security definer 函数体内的
--      执行上下文是函数属主，属主对自己创建的所有对象天然有执行权限，
--      不需要额外 grant，这里不用、也不应该改这三个函数的权限。
--   2. 消息打标记：不直接调用 sendMessage 那条 INSERT 路径（那是给"真实
--      用户发的普通消息"用的，sender_id 必须是发消息的人本人，且不会写
--      notification_payload），改成照抄 notify_user() 那份迁移里"系统通知"
--      的写法——sender_id 传 null、notification_payload 填结构化内容，
--      前端据此渲染成卡片而不是聊天气泡（见
--      20260818162736_create_notify_user_function.sql）。notification_payload
--      里多带一个 "kind": "activity_broadcast" 字段（notify_user() 原来的
--      结构没有这个字段，NotificationPayload 类型本来就是 jsonb，不需要
--      改表结构）——前端要能把"发起人群发的活动通知"和"Saminest 官方系统
--      通知"（origin_type = 'system' 会话里那种）区分开，渲染成不同的卡片
--      样式（"📢活动通知" vs 🔔"Saminest 通知"），这个字段就是区分依据。
--
-- 影响哪些表：
--   不新建表、不加列、不改任何已有表结构。只新增一个函数
--   notify_activity_participants(uuid, text)，函数体内 insert 到已有的
--   public.messages 表（notification_payload 这一列本来就存在，见
--   20260818162648_add_system_notification_support.sql），并通过调用
--   get_or_create_direct_conversation() 间接可能 insert 到已有的
--   public.conversations / public.conversation_members 两张表。
--
-- 是否影响现有数据：
--   不影响，不修改任何现有行。
--
-- 权限设计：
--   跟 approve_activity_participant/reject_activity_participant 同一个
--   模式——发起人身份校验在函数体内做（organizer_id <> auth.uid() 直接
--   报错），执行权限只 grant 给 authenticated。这个项目里新建函数默认会
--   把 execute 权限单独授予 anon 角色（不会因为 revoke ... from public
--   就跟着收回，见 20260818163106_fix_notify_user_anon_execute_leak.sql
--   踩过的坑），这里直接一步到位显式收回 anon 的权限，不留同样的漏洞。
--
-- 拉黑参与者的处理（任务卡 4 明确要求）：
--   "悄悄跳过，不中断其它人的发送，不需要让调用者看到失败提示"——循环内
--   每个参与者单独包一层 BEGIN/EXCEPTION WHEN OTHERS/END，
--   get_or_create_direct_conversation() 因为拉黑关系抛出的异常会在这里被
--   吞掉、continue 到下一个参与者，不会让整个函数因为其中一个人被拉黑而
--   整体失败、也不会往上抛出任何错误信息标出具体是哪个人。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 本地验证：⚠️ 这份迁移完全没有跑过任何真实的 Postgres/Supabase 实例
-- 验证——当时开发环境没有可用的本地 Supabase 栈，只做了人工通读代码
-- （对照 create_activity_conversation / get_or_create_direct_conversation
-- 已有实现逐行核对语法和调用签名），既没有用本地 `supabase db reset` /
-- `supabase migration up` 跑过，也完全没有用 apply_migration 或任何方式
-- 碰过线上生产库（kdpzbpapnufvgbfgjgcr）。合并到 main 之前必须先在本地
-- 或 staging Supabase 环境里真实跑一遍这份迁移并手工验证行为（尤其是
-- BEGIN/EXCEPTION 吞异常那段、以及 revoke/grant 权限那两行），不能只凭
-- 这段代码审查就当作已验证。

create or replace function public.notify_activity_participants(
  target_activity_id uuid,
  body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organizer_id uuid;
  v_activity_title text;
  v_trimmed_body text := trim(both from coalesce(body, ''));
  v_conversation_id uuid;
  v_participant record;
begin
  if v_actor_id is null then
    raise exception 'notify_activity_participants requires an authenticated user';
  end if;

  if public.is_account_restricted() then
    raise exception 'restricted accounts cannot notify activity participants';
  end if;

  if v_trimmed_body = '' then
    raise exception 'notify_activity_participants requires a non-empty body';
  end if;

  select organizer_id, title into v_organizer_id, v_activity_title
  from public.activities
  where id = target_activity_id
    and deleted_at is null;

  if v_organizer_id is null then
    raise exception 'activity % not found', target_activity_id;
  end if;

  if v_organizer_id <> v_actor_id then
    raise exception 'only the activity organizer can notify participants';
  end if;

  -- "已加入（active）"跟 sync_activity_participant_count 触发器、
  -- listActivityParticipants 的口径一致：status = 'approved' 且
  -- cancelled_at 为空（见 20260816175611_activity_join_approval.sql）。
  -- pending/rejected/已退出的人不在群发范围内。
  for v_participant in
    select ap.user_id
    from public.activity_participants ap
    where ap.activity_id = target_activity_id
      and ap.status = 'approved'
      and ap.cancelled_at is null
  loop
    begin
      v_conversation_id := public.get_or_create_direct_conversation(
        v_organizer_id,
        v_participant.user_id,
        'activity'
      );

      insert into public.messages (conversation_id, sender_id, body, notification_payload)
      values (
        v_conversation_id,
        null,
        v_trimmed_body,
        jsonb_build_object(
          'title', '📢 活动通知',
          'summary', '《' || v_activity_title || '》：' || v_trimmed_body,
          'link', '/activities/' || target_activity_id::text,
          'kind', 'activity_broadcast'
        )
      );
    exception
      when others then
        -- 大概率是 get_or_create_direct_conversation() 因为这个参与者跟
        -- 发起人存在拉黑关系抛出的异常（is_blocked_with()）——悄悄跳过，
        -- 不中断其它参与者的发送，也不让调用者看到失败提示，见文件头
        -- 说明。理论上也可能是其它未预期的单行失败（比如极小概率的并发
        -- 冲突），这次不做更细的错误分类，统一按"跳过这一个人"处理。
        continue;
    end;
  end loop;
end;
$$;

revoke execute on function public.notify_activity_participants(uuid, text) from public;
revoke execute on function public.notify_activity_participants(uuid, text) from anon;
grant execute on function public.notify_activity_participants(uuid, text) to authenticated;

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- revoke execute on function public.notify_activity_participants(uuid, text) from authenticated;
-- drop function if exists public.notify_activity_participants(uuid, text);
