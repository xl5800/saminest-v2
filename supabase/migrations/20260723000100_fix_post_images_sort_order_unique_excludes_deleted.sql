-- Migration: post_images 的 (post_id, sort_order) 唯一约束改为只对未软删除的
-- 行生效，修复"编辑帖子时删图/换图后再传新图，整批全部失败"的 bug
--
-- 为什么改：
--   排查"iPhone Safari 图片上传失败"的用户反馈时，直接查了 Supabase
--   Storage 和数据库，发现真实情况是：图片确实成功传到了 Storage，但
--   post_images 表里没有对应的记录（Storage 里能看到孤儿文件，数据库
--   查不到）。
--
--   根因不是 Safari 兼容性问题，是这张表原有的
--   post_images_post_id_sort_order_key（UNIQUE (post_id, sort_order)）
--   约束本身的设计缺陷：这条约束覆盖表里的所有行，包括已经软删除
--   （deleted_at 不为 null）的行。而前端计算新图片 sort_order 时，用的是
--   "当前还在显示的图片数量"（未软删除的数量）。
--
--   一旦用户在编辑帖子时删除了已有图片（软删除，行还在表里，只是打了
--   deleted_at 标记），这些行占用的 sort_order 数字就会一直占着坑，
--   不会因为软删除而释放。这时候如果再传新图片，前端会按"当前显示的
--   图片数量"重新从 0（或更小的数字）开始编号，直接撞上那些"已经软删除
--   但还占着坑"的旧记录，触发这条唯一约束冲突。Storage 上传本身是独立
--   的一步，已经成功、不会回滚，于是就变成了 Storage 里有文件、数据库
--   里没记录的孤儿文件——这正是用户反馈"点发布/保存之后图片还是失败"
--   的真正原因。
--
--   已经用两条真实数据验证过这个链路（帖子 97bed9e4...：6 张图全部被
--   软删除后几秒内尝试上传 4 张新图，全部因为撞上 sort_order=0-3 的旧
--   记录而失败；帖子 10e1e262...：更早删过一张占了 sort_order=0，之后
--   传新图同样从 0 开始，同样撞上）。
--
--   这也解释了"电脑能传、手机传不了"的表面现象：不是浏览器差异，而是
--   使用场景差异——电脑测试大多是发全新帖子（sort_order 从 0 开始，
--   没有历史记录可撞），手机上更多是编辑已有帖子、换图/删图后再传，
--   正好会触发这个 bug。
--
-- 影响哪些表：
--   只改 public.post_images 这一张表的约束定义，不改列、不改数据、不
--   影响其他表。
--
-- 修法：
--   删除原有的表级 UNIQUE (post_id, sort_order) 约束，改成一条局部
--   （partial）唯一索引，只对 deleted_at IS NULL 的行生效。这样软删除的
--   行不再占用 sort_order 坑位，新图片可以正常复用这些数字；同一个帖子
--   下"当前有效的"图片之间，sort_order 仍然保证唯一，不影响原本的排序
--   语义。
--
-- 是否影响现有数据：
--   不影响。新的局部唯一索引比原来的全表唯一约束更宽松（排除了软删除
--   行），现有满足全表唯一约束的数据必然也满足这条更宽松的局部索引，
--   不会因为这次迁移报错或需要清理数据。
--
--   注意：这次排查中发现的孤儿 Storage 文件（图片文件已上传但数据库无
--   对应记录）不在这个迁移的范围内，不会被这次迁移自动清理，需要另外
--   评估是否要清理。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，会重新引入这次要修的
--   bug，需要人工确认后单独运行）。

alter table public.post_images
  drop constraint if exists post_images_post_id_sort_order_key;

create unique index if not exists post_images_post_id_sort_order_active_key
  on public.post_images (post_id, sort_order)
  where deleted_at is null;

-- 回滚方案（默认不执行，会让"删图/换图后再传新图"这个场景重新触发
-- 整批插入失败，需要人工确认后单独运行）：
--
-- drop index if exists public.post_images_post_id_sort_order_active_key;
-- alter table public.post_images
--   add constraint post_images_post_id_sort_order_key unique (post_id, sort_order);
