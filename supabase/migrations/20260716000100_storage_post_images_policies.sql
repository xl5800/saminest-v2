-- Migration: storage.objects RLS policies for the post-images bucket
--
-- 为什么改：
--   为 Storage 里的 post-images bucket 配置 storage.objects 的 RLS 策略，
--   对应 docs/02_SystemDesign/Architecture.md 第 15 节的路径规则
--   （post-images/{user_id}/{post_id}/{image_id}.webp）和
--   docs/03_Database/Tables.md 第 10.5 节的权限原则。
--
-- 影响哪些表：
--   storage.objects（Supabase 内置表），只新增针对 bucket_id =
--   'post-images' 这一条件的策略，不影响其他 bucket 的策略。
--
-- 是否影响现有数据：
--   不影响。本迁移假定 post-images bucket 已经存在且已设为 public
--   （bucket 本身的创建不在本迁移范围内，按任务要求只做 RLS 策略）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 归属判断方式的说明（需要你确认）：
--   Supabase 不同版本的 storage.objects 表里，标记"谁上传的"这一列
--   有的叫 owner，有的叫 owner_id，写法不完全通用。为了避免依赖这个
--   容易变化的列，这里统一用路径规则判断归属：文件路径第一段
--   （storage.foldername(name) 的第一个元素）必须等于 auth.uid()，
--   上传、更新、删除都用同一条规则判断，而不是用 owner/owner_id 列。
--   这样只要客户端按 {user_id}/{post_id}/{image_id}.webp 的路径上传，
--   归属判断就是一致的。

create policy post_images_storage_select_public
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'post-images'
  );

create policy post_images_storage_insert_own_folder
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy post_images_storage_update_own_folder
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy post_images_storage_delete_own_folder
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists post_images_storage_delete_own_folder on storage.objects;
-- drop policy if exists post_images_storage_update_own_folder on storage.objects;
-- drop policy if exists post_images_storage_insert_own_folder on storage.objects;
-- drop policy if exists post_images_storage_select_public on storage.objects;
