-- Migration: create the public avatars Storage bucket + its storage.objects
-- RLS policies
--
-- 为什么改：
--   支持用户上传头像（社交资料页 + 私信功能第一批）。头像要在首页/找
--   搭子/消息/资料页等公开场景展示，包括未登录游客浏览公开资料页时也要
--   能看到，所以是 public bucket，跟 post-images 是同一个可见性级别，
--   不是 feedback-images 那种私有 bucket。
--
-- 影响哪些表：
--   storage.buckets 新增一行（id = 'avatars'）；storage.objects 新增只
--   针对这个 bucket_id 的三条策略（select/insert/delete）。不加 update
--   策略——跟 feedback-images 一样，每次上传新头像都用新生成的 image_id
--   走一遍 insert，旧文件由客户端事后单独调用 delete 清理，不走"原地
--   替换"的 update 语义。
--
-- 是否影响现有数据：
--   不影响，全新 bucket。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 归属判断方式：跟 post-images/feedback-images 同一个写法——用路径规则
-- 判断归属（storage.foldername(name) 的第一段必须等于 auth.uid()），不
-- 依赖 storage.objects 表上 owner/owner_id 这个不同版本不完全通用的列。
-- 客户端上传路径必须是 {user_id}/{image_id}.<ext>。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  20 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy avatars_storage_select_public
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'avatars'
  );

create policy avatars_storage_insert_own_folder
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_storage_delete_own_folder
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists avatars_storage_delete_own_folder on storage.objects;
-- drop policy if exists avatars_storage_insert_own_folder on storage.objects;
-- drop policy if exists avatars_storage_select_public on storage.objects;
-- delete from storage.buckets where id = 'avatars';
