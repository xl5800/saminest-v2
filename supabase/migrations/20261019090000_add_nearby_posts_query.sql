-- 首页"附近的二手"任务卡：按距离查帖子 + 按坐标找最近的邮编。
--
-- 设计（见对话里定下的方案）：
-- - 帖子的位置 = 帖子邮编（posts.zip_code）在 zip_codes 表里的中心点，只精确到
--   邮编，不暴露具体地址。
-- - 用户的位置（手机定位的经纬度，或者用户输入的邮编对应的经纬度）只作为参数
--   传进来，函数不存任何东西。
-- - 不按范围截断：所有符合条件的帖子按距离从近到远排，前端按 distance_miles
--   在第一条超过所选范围（默认 50 英里）的帖子前插"以下距离超过 X 英里"分隔线，
--   看完附近的自动接着看更远的，附近帖子少的时候首页也不会空。
-- - 没填邮编的老帖子 distance_miles 为 null，排在最后（按发布时间从新到旧）。
-- - 同距离（同一个邮编）的帖子按发布时间从新到旧。
--
-- 函数只返回"帖子 id + 距离"，帖子内容由前端再用现有的列表查询按 id 取，
-- 卡片字段和图片的处理跟现在的列表完全一致，不在这里重复一份 select。
--
-- 两个函数都是 security invoker（默认）：按调用者自己的身份执行，posts /
-- categories / zip_codes 现有的 RLS 照样生效；另外这里显式只取审核通过、
-- 公开、没删除的帖子——作者自己的待审核帖子、管理员能看到的帖子不会混进
-- 附近列表（跟现有 listApprovedPosts 的 status = 'approved' 一致）。
--
-- 距离用球面距离（haversine）公式，地球半径 3958.8 英里。现在帖子是几百到几千
-- 条，全表算一遍很快；以后数据量大了再换 PostGIS，前端接口不用变。
--
-- 回滚（如需）：
--   drop function if exists public.list_nearby_posts(double precision, double precision, text[], integer, integer);
--   drop function if exists public.nearest_zip_code(double precision, double precision);
--   drop index if exists public.zip_codes_latitude_longitude_idx;

create index if not exists zip_codes_latitude_longitude_idx
  on public.zip_codes (latitude, longitude);

create or replace function public.list_nearby_posts(
  p_latitude double precision,
  p_longitude double precision,
  p_category_slugs text[],
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (post_id uuid, distance_miles double precision)
language sql
stable
set search_path = public
as $$
  select
    p.id as post_id,
    case
      when z.zip is null then null
      else 3958.8 * 2 * asin(least(1.0, sqrt(
        power(sin(radians(z.latitude - p_latitude) / 2), 2)
        + cos(radians(p_latitude)) * cos(radians(z.latitude))
          * power(sin(radians(z.longitude - p_longitude) / 2), 2)
      )))
    end as distance_miles
  from public.posts p
  join public.categories c on c.id = p.category_id
  left join public.zip_codes z on z.zip = p.zip_code
  where p.status = 'approved'
    and p.visibility = 'public'
    and p.deleted_at is null
    and c.slug = any (p_category_slugs)
  order by distance_miles asc nulls last, p.created_at desc, p.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.list_nearby_posts(double precision, double precision, text[], integer, integer) is
  '附近的帖子：按 (p_latitude, p_longitude) 到帖子邮编中心点的距离（英里）从近到远排，没邮编的排最后。只返回 id + 距离，不截断范围。';

create or replace function public.nearest_zip_code(
  p_latitude double precision,
  p_longitude double precision
)
returns table (zip text, city text, state_code text)
language sql
stable
set search_path = public
as $$
  -- 先用经纬度各 ±1 度（约 69 英里）圈一个框走索引，再按平面近似距离取最近的
  -- 一个。用户在美国本土以外（框里没有邮编）时返回空。
  select z.zip, z.city, z.state_code
  from public.zip_codes z
  where z.latitude between p_latitude - 1 and p_latitude + 1
    and z.longitude between p_longitude - 1.5 and p_longitude + 1.5
  order by power(z.latitude - p_latitude, 2)
    + power((z.longitude - p_longitude) * cos(radians(p_latitude)), 2)
  limit 1;
$$;

comment on function public.nearest_zip_code(double precision, double precision) is
  '按坐标找最近的邮编和城市（定位后在首页位置条显示"Rockville 附近"用）。';

grant execute on function public.list_nearby_posts(double precision, double precision, text[], integer, integer)
  to anon, authenticated;
grant execute on function public.nearest_zip_code(double precision, double precision)
  to anon, authenticated;
