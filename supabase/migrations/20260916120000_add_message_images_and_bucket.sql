-- Migration: 联系客服改成真聊天——messages 支持单图 + 新建私有
-- message-images Storage 桶
--
-- 为什么改：
--   "联系客服改成真聊天"任务卡第一步：聊天消息要能带一张图片。跟
--   feedback_images 那次"直接存 public_url，结果桶是私有的，后台从来
--   没显示出过一张图"的教训不重复——这次图片列存 Storage 路径
--   （image_path），不存 URL，桶保持私有，前端按需用
--   createSignedUrl()/createSignedUrls() 现签地址再显示，不依赖一个
--   本来就用不了的公开地址字段。
--
--   一条消息最多带一张图（照聊天 App 常见做法，不做多图消息）；文字和
--   图片可以只有其中一个，也可以两个都有，但不能两个都没有——新增
--   messages_body_or_image_check 这条约束表达这条规则，跟已有的
--   messages_body_length_check（body 非空时限制长度）是两件独立的事，
--   不合并成一条。
--
-- 影响哪些表：
--   public.messages 新增可空列 image_path；新增约束
--   messages_body_or_image_check；重建 sync_conversation_last_message_at()
--   触发器函数，image_path 不为空、body 为空时，会话列表预览文字退回
--   "[图片]"（跟微信/大多数聊天 App 的"最近一条是图片"预览是同一个惯例），
--   不是留空——原来的 coalesce(body, summary, title) 三选一在纯图片消息
--   这种新场景下会全部落空，变成空预览，是这次新增 image_path 直接带来
--   的一个新缺口，顺手一起补上，不是这份迁移之外的另一个问题。
--
--   新建私有 Storage 桶 message-images（不是公开桶，同一个理由见上面），
--   storage.objects 三条策略（select/insert/delete）。跟 feedback-images
--   桶的策略写法不同的一点：feedback-images 的路径是
--   {user_id}/{feedback_id}/{image_id}.<ext>，读权限只给上传者本人+
--   管理员（反馈是"用户单向提交给客服"，没有"对方也要看到"这个需求）；
--   这次图片是聊天场景，双方（用户自己 + 管理员，如果以后聊天场景扩展到
--   两个真实用户之间也一样）都要能看到，所以路径设计成
--   {conversation_id}/{image_id}.<ext>（不含 user_id），归属判断从"路径
--   第一段等于 auth.uid()"换成"路径第一段对应的会话，我是不是这个会话
--   的成员"（is_conversation_member/is_active_conversation_member，跟
--   messages 表自己的 RLS 用的是同一对 helper 函数，不是重新发明一套
--   判断逻辑），管理员额外用 is_admin() 兜底放行——管理员回复客服会话时
--   需要上传图片，但管理员不是那条会话的成员，纯按"是不是成员"判断的话
--   会把管理员自己也挡在外面。
--
-- 是否影响现有数据：
--   image_path 新增列默认 null，不影响历史消息；
--   messages_body_or_image_check 对历史数据天然满足（历史消息 body 全部
--   非空，image_path 这一列本来就还没有任何数据）。Storage 是全新桶，
--   不影响其它桶的策略。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.messages
  add column image_path text null default null;

comment on column public.messages.image_path is
  '这条消息附带的图片在 message-images 这个私有 Storage 桶里的路径（不是
  URL），格式 {conversation_id}/{image_id}.<ext>。一条消息最多一张图，
  跟 body 至多两者都有、至少一者非空，见 messages_body_or_image_check。
  私有桶，前端按需用 createSignedUrl() 现签地址显示，不要重蹈
  feedback_images.public_url 那次"存了一个私有桶生成不出来的公开地址"
  的覆辙。';

alter table public.messages
  add constraint messages_body_or_image_check
    check (body is not null or image_path is not null);

-- messages_sender_or_notification_check 原来只允许两种组合：真人发的
-- 普通消息（sender_id 非空 + notification_payload 必须为空）、结构化
-- 系统通知卡片（sender_id 为空 + notification_payload 必须非空）。这次
-- 放开第三种：客服的聊天回复（admin_reply_to_support_conversation()
-- 插入的那种）——sender_id 为空（不是任何真实用户发的）、
-- notification_payload 也为空（不是结构化通知卡片，就是一条普通聊天
-- 气泡，只是发送者是"官方客服"）。三种组合互斥、覆盖了 sender_id/
-- notification_payload 两列各自为空/非空的全部四种排列中的三种，唯一
-- 排除的是"sender_id 和 notification_payload 都非空"这一种（一条消息
-- 不应该同时是"某个真实用户发的"又是"结构化系统通知卡片"）。
alter table public.messages
  drop constraint messages_sender_or_notification_check;

alter table public.messages
  add constraint messages_sender_or_notification_check
    check (
      (sender_id is not null and notification_payload is null)
      or (sender_id is null and notification_payload is not null)
      or (sender_id is null and notification_payload is null)
    );

-- 联系客服改成真聊天任务卡：image_path 不为空、body 为空时（纯图片
-- 消息），会话列表预览退回"[图片]"，不再是空字符串——三个 coalesce 分支
-- 原来只覆盖"有文字"和"系统通知"两种情况，纯图片消息落不进任何一支，
-- 这里补上第三支。
create or replace function public.sync_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = coalesce(
        new.body,
        case when new.image_path is not null then '[图片]' else null end,
        new.notification_payload ->> 'summary',
        new.notification_payload ->> 'title'
      ),
      last_message_sender_id = new.sender_id
  where id = new.conversation_id;

  return new;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-images',
  'message-images',
  false,
  20 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 归属判断方式：路径 {conversation_id}/{image_id}.<ext>，第一段是会话
-- id（不是 user_id，见文件顶部说明）。SELECT 放行"这个会话的任意成员"
-- （不要求当前仍是活跃成员——跟 messages 表自己"能不能读历史消息"不要求
-- 活跃成员是同一个口径）或者管理员；INSERT/DELETE 收紧到"当前仍是活跃
-- 成员"或者管理员——管理员回复客服会话需要能上传/清理自己上传失败的
-- 孤儿图片，但管理员从来不是任何一条客服会话的 conversation_members
-- 行，纯按成员关系判断会把管理员自己也拦在外面，所以额外 or
-- public.is_admin()。
create policy message_images_storage_select_conversation_member_or_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'message-images'
    and (
      is_conversation_member((storage.foldername(name))[1]::uuid)
      or public.is_admin()
    )
  );

create policy message_images_storage_insert_active_member_or_admin
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'message-images'
    and (
      is_active_conversation_member((storage.foldername(name))[1]::uuid)
      or public.is_admin()
    )
  );

create policy message_images_storage_delete_active_member_or_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'message-images'
    and (
      is_active_conversation_member((storage.foldername(name))[1]::uuid)
      or public.is_admin()
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists message_images_storage_delete_active_member_or_admin on storage.objects;
-- drop policy if exists message_images_storage_insert_active_member_or_admin on storage.objects;
-- drop policy if exists message_images_storage_select_conversation_member_or_admin on storage.objects;
-- delete from storage.buckets where id = 'message-images';
--
-- create or replace function public.sync_conversation_last_message_at()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   update public.conversations
--   set last_message_at = new.created_at,
--       last_message_preview = coalesce(
--         new.body,
--         new.notification_payload ->> 'summary',
--         new.notification_payload ->> 'title'
--       ),
--       last_message_sender_id = new.sender_id
--   where id = new.conversation_id;
--   return new;
-- end;
-- $$;
--
-- alter table public.messages drop constraint messages_sender_or_notification_check;
-- alter table public.messages add constraint messages_sender_or_notification_check
--   check (
--     (sender_id is not null and notification_payload is null)
--     or (sender_id is null and notification_payload is not null)
--   );
--
-- alter table public.messages drop constraint messages_body_or_image_check;
-- alter table public.messages drop column image_path;
