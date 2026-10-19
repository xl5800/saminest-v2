-- 免费物品任务卡 + 找搭子发布页 ZIP 定位：
--
-- 1. 新增分类"免费物品"（slug = free）。免费物品帖子跟二手一样走 posts 表 +
--    category_id，不加新列：价格不填（price_amount = null），price_label 写
--    "免费"，列表 / 详情现有的 formatPrice 会直接显示"免费"。跟其它分类一样
--    发帖后待审核（status = pending）。
-- 2. activities.zip_code：发起找搭子活动时填的邮编（可选，5 位数字），跟
--    posts.zip_code（20261019030000_add_zip_codes.sql）同一个规则。活动卡片上
--    显示的位置仍然是原来的 location_id（州）+ landmark_text（地标）。
--
-- 回滚（如需）：
--   alter table public.activities drop column if exists zip_code;
--   delete from public.categories where slug = 'free';
--   （有免费物品帖子时先处理那些帖子，category_id 有外键）

insert into public.categories (slug, name_zh, name_en, sort_order, is_active)
values ('free', '免费物品', 'Free stuff', 6, true)
on conflict (slug) do nothing;

alter table public.activities
  add column zip_code text,
  add constraint activities_zip_code_format_check check (zip_code is null or zip_code ~ '^[0-9]{5}$');

comment on column public.activities.zip_code is
  '发起活动时填的美国邮编（可选）。显示用的位置仍在 location_id（州）+ landmark_text。';
