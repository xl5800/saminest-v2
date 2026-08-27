-- Migration: 16 号卡（修订版）——去掉 create_direct_conversation() /
-- create_activity_conversation() 里自动插入"关于：《标题》"引用消息的调用
--
-- 为什么改：
--   16 号卡任务卡在上一份迁移（20260825044820_unify_direct_conversation_
--   lookup_and_reference_messages.sql）落地之后又改过一版：最终版本明确
--   要求"不额外插入任何'关于哪个帖子'的提示消息，点联系就是直接进对话"，
--   联系上下文这一版不做记录。上一份迁移已经把"两个人之间只保留一条
--   会话"这个核心去重逻辑做对了（find_direct_conversation_between 双向
--   查找 / get_or_create_direct_conversation / 屏蔽拦截 / 限流 /
--   origin_type bug 修复 / 内部函数权限收紧，全部保留、不用动），只是
--   顺带插入引用消息这一小块要去掉。
--
-- 影响哪些函数：
--   只重建 create_direct_conversation(uuid) / create_activity_conversation(uuid)
--   这两个函数——去掉各自末尾那一次
--   `perform public.insert_conversation_reference_message(...)` 调用，
--   连同只为了拼这条消息内容才需要的 v_post_title / v_activity_title
--   两个局部变量（对应地，两个函数里 select 帖子/活动信息那一步也不再
--   多查 title 这一列，只查 author_id/organizer_id）。函数体其它部分
--   （身份校验、自己联系自己检查、调用 get_or_create_direct_conversation()
--   拿到/建出会话 id）逐字不变。
--
--   get_or_create_direct_conversation() / find_direct_conversation_between() /
--   create_direct_conversation_row() 三个共享函数不用动，逻辑完全不变。
--
--   insert_conversation_reference_message() 这个函数本身、messages 表的
--   ref_post_id / ref_activity_id 两列、messages_ref_single_check 约束——
--   都不删，留着不用即可，不是这次改动的一部分；以后如果要做更完整的
--   "引用卡片"，这份 schema 可以直接复用，没必要现在为了收尾干净再多做
--   一次表结构改动。
--
-- 是否影响现有数据：
--   不影响任何现有行。之前（上一份迁移生效期间）已经产生的历史引用消息
--   不做任何清理/迁移，继续原样保留在 messages 表里——前端这一版去掉了
--   "识别 ref_post_id/ref_activity_id 渲染成小灰条"这段特殊逻辑之后，这几
--   条历史消息会自然退回普通聊天气泡展示（body 字面文本就是"关于：
--   《标题》"），不会报错或者显示空白，也不需要为了它们专门做兼容处理。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独
--   运行——回滚会恢复"每次联系都插入一条关于：《标题》引用消息"这个
--   已经被产品明确否掉的行为，不建议真的执行）。
--
-- 本地验证：这份迁移只在本地 Supabase（`supabase start` + `supabase db
-- reset`）跑过，没有用 apply_migration 或任何方式跑到线上生产库
-- （kdpzbpapnufvgbfgjgcr）——按任务卡要求，这份文件写好、本地验证通过
-- 就先停在这里，等确认内容之后再由人工统一走上线流程。

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

  v_conversation_id := public.get_or_create_direct_conversation(v_buyer_id, v_seller_id, 'post');

  return v_conversation_id;
end;
$$;

create or replace function public.create_activity_conversation(target_activity_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organizer_id uuid;
  v_conversation_id uuid;
begin
  if v_actor_id is null then
    raise exception 'create_activity_conversation requires an authenticated user';
  end if;

  if public.is_account_restricted() then
    raise exception 'restricted accounts cannot start a direct conversation';
  end if;

  select organizer_id into v_organizer_id
  from public.activities
  where id = target_activity_id
    and deleted_at is null;

  if v_organizer_id is null then
    raise exception 'activity % not found', target_activity_id;
  end if;

  if v_organizer_id = v_actor_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  v_conversation_id := public.get_or_create_direct_conversation(v_actor_id, v_organizer_id, 'activity');

  return v_conversation_id;
end;
$$;

-- 回滚方案（默认不执行，需要人工确认后单独运行——回滚会恢复"每次联系都
-- 插入一条关于：《标题》引用消息"这个已经被产品明确否掉的行为）：
--
-- 把 create_direct_conversation / create_activity_conversation 两个函数
-- 重新 create or replace 回
-- 20260825044820_unify_direct_conversation_lookup_and_reference_messages.sql
-- 里贴的那两个版本（带 v_post_title/v_activity_title + 查 title 列 +
-- perform insert_conversation_reference_message(...) 那几行），逐字复制
-- 回去即可，这里不重复贴一遍全文。
