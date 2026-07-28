-- Migration: create the private feedback-images Storage bucket + its
-- storage.objects RLS policies
--
-- 为什么改：
--   反馈截图可能带用户设备/个人信息，不能像 post-images 那样是公开
--   bucket——这次直接建一个私有 bucket（public = false），只有上传者
--   本人和管理员能读。
--
--   file_size_limit 直接设成 20MB，跟 post-images bucket 现在的值保持
--   一致（见 supabase/migrations/20260722000500_raise_post_images_bucket_
--   file_size_limit.sql 那次教训：bucket 自己的 file_size_limit 是
--   Storage 服务端独立的一道硬限制，跟前端选图/压缩逻辑完全是两回事，
--   这次建 bucket 就直接设对，不留到以后再补一次修复迁移）。
--
-- 影响哪些表：
--   storage.buckets 新增一行（id = 'feedback-images'）；storage.objects
--   新增只针对这个 bucket_id 的三条策略（select/insert/delete）。
--
-- 是否影响现有数据：
--   不影响，全新 bucket，不影响其它 bucket 的策略。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 归属判断方式：跟 post-images bucket 同一个写法——用路径规则判断归属
-- （storage.foldername(name) 的第一段必须等于 auth.uid()），不依赖
-- Supabase 不同版本里 storage.objects 表上"谁上传的"这一列（owner /
-- owner_id）不完全通用的问题。客户端上传路径必须是
-- {user_id}/{feedback_id}/{image_id}.<ext>。
--
-- 没有 UPDATE 策略：这一批没有"替换/编辑已上传截图"的功能，只有
-- 上传（insert）和失败补偿清理（delete）两条路径会用到，不提前开放
-- 用不到的权限。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-images',
  'feedback-images',
  false,
  20 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy feedback_images_storage_select_own_or_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'feedback-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

create policy feedback_images_storage_insert_own_folder
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'feedback-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy feedback_images_storage_delete_own_folder
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'feedback-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists feedback_images_storage_delete_own_folder on storage.objects;
-- drop policy if exists feedback_images_storage_insert_own_folder on storage.objects;
-- drop policy if exists feedback_images_storage_select_own_or_admin on storage.objects;
-- delete from storage.buckets where id = 'feedback-images';
