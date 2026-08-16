-- 找搭子（活动）的地区筛选/发起活动地区选择，从"选具体城市"改成"选州"
-- （DC/VA/MD），具体城市改成发起人自己写进标题。复用现有 locations 表，
-- 不新建表——这张表本来就有 type 列（一直只填过 'city'，从没真正用上），
-- 这里新增 3 条 type = 'state' 的行，跟原有 14 条 type = 'city' 的行
-- （发帖还在用）互不干扰，查询时用 type 区分。
insert into public.locations
  (type, name, slug, state_code, country_code, sort_order, is_active)
values
  ('state', 'DC', 'dc', 'DC', 'US', 1, true),
  ('state', 'VA', 'va', 'VA', 'US', 2, true),
  ('state', 'MD', 'md', 'MD', 'US', 3, true);
