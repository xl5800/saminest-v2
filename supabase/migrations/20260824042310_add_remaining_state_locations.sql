-- 12 号卡「地区选择格式统一 + 全局复用 /region-select」：把全美 51 州
-- （50 州 + DC）里除了已有的 DC/VA/MD 之外的另外 48 个州，补成
-- locations 表里 type = 'state' 的行——完全照抄 20260816223226 那次迁移
-- 的写法（只插州级行本身，不造城市子行，这样 08 号卡"有真实城市数据才
-- 显示下钻箭头"的判断不会被误触发，这 48 个州选中后仍然是"直接选中
-- 整个州"，不会平白多出一个下钻箭头）。
--
-- 这样一来，activities.location_id（发起搭子的地区，线下必填外键，
-- 没有自由文本兜底字段）就能引用全美任意一个州，不再局限于 DC/VA/MD
-- 三个州——12 号卡要求"发起搭子"表单跳转 /region-select 选满全部 51 项，
-- 这是这个改动能落地的前提。
--
-- 顺带把 08 号卡"按热度排序"依赖的 listRegionContentCounts() 统计口径
-- 补全：DMV 之外的州这之前永远算不出非零热度（活动侧压根没有
-- location_id 可写），插完这些州之后，以后别的州有活动发起，热度才能
-- 算准——这是这次迁移的自然副作用，不是本次迁移单独要做的事。
insert into public.locations
  (type, name, slug, state_code, country_code, sort_order, is_active)
values
  ('state', 'AL', 'al', 'AL', 'US', 4, true),
  ('state', 'AK', 'ak', 'AK', 'US', 5, true),
  ('state', 'AZ', 'az', 'AZ', 'US', 6, true),
  ('state', 'AR', 'ar', 'AR', 'US', 7, true),
  ('state', 'CA', 'ca', 'CA', 'US', 8, true),
  ('state', 'CO', 'co', 'CO', 'US', 9, true),
  ('state', 'CT', 'ct', 'CT', 'US', 10, true),
  ('state', 'DE', 'de', 'DE', 'US', 11, true),
  ('state', 'FL', 'fl', 'FL', 'US', 12, true),
  ('state', 'GA', 'ga', 'GA', 'US', 13, true),
  ('state', 'HI', 'hi', 'HI', 'US', 14, true),
  ('state', 'ID', 'id', 'ID', 'US', 15, true),
  ('state', 'IL', 'il', 'IL', 'US', 16, true),
  ('state', 'IN', 'in', 'IN', 'US', 17, true),
  ('state', 'IA', 'ia', 'IA', 'US', 18, true),
  ('state', 'KS', 'ks', 'KS', 'US', 19, true),
  ('state', 'KY', 'ky', 'KY', 'US', 20, true),
  ('state', 'LA', 'la', 'LA', 'US', 21, true),
  ('state', 'ME', 'me', 'ME', 'US', 22, true),
  ('state', 'MA', 'ma', 'MA', 'US', 23, true),
  ('state', 'MI', 'mi', 'MI', 'US', 24, true),
  ('state', 'MN', 'mn', 'MN', 'US', 25, true),
  ('state', 'MS', 'ms', 'MS', 'US', 26, true),
  ('state', 'MO', 'mo', 'MO', 'US', 27, true),
  ('state', 'MT', 'mt', 'MT', 'US', 28, true),
  ('state', 'NE', 'ne', 'NE', 'US', 29, true),
  ('state', 'NV', 'nv', 'NV', 'US', 30, true),
  ('state', 'NH', 'nh', 'NH', 'US', 31, true),
  ('state', 'NJ', 'nj', 'NJ', 'US', 32, true),
  ('state', 'NM', 'nm', 'NM', 'US', 33, true),
  ('state', 'NY', 'ny', 'NY', 'US', 34, true),
  ('state', 'NC', 'nc', 'NC', 'US', 35, true),
  ('state', 'ND', 'nd', 'ND', 'US', 36, true),
  ('state', 'OH', 'oh', 'OH', 'US', 37, true),
  ('state', 'OK', 'ok', 'OK', 'US', 38, true),
  ('state', 'OR', 'or', 'OR', 'US', 39, true),
  ('state', 'PA', 'pa', 'PA', 'US', 40, true),
  ('state', 'RI', 'ri', 'RI', 'US', 41, true),
  ('state', 'SC', 'sc', 'SC', 'US', 42, true),
  ('state', 'SD', 'sd', 'SD', 'US', 43, true),
  ('state', 'TN', 'tn', 'TN', 'US', 44, true),
  ('state', 'TX', 'tx', 'TX', 'US', 45, true),
  ('state', 'UT', 'ut', 'UT', 'US', 46, true),
  ('state', 'VT', 'vt', 'VT', 'US', 47, true),
  ('state', 'WA', 'wa', 'WA', 'US', 48, true),
  ('state', 'WV', 'wv', 'WV', 'US', 49, true),
  ('state', 'WI', 'wi', 'WI', 'US', 50, true),
  ('state', 'WY', 'wy', 'WY', 'US', 51, true);
