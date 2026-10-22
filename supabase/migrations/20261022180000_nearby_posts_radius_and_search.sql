-- 房屋租售页距离筛选：list_nearby_posts 加两个可选参数。
--
-- 为什么改：
--   房屋页（出租 / 求租）加"距离"筛选，复用首页"附近的二手"那套按邮编算距离的
--   函数。但房源过期很快，用户更想先看新的，所以房屋页要的排序跟二手不一样：
--     1. 范围内的帖子按发布时间从新到旧；
--     2. 超出范围的接在后面，按距离从近到远（前端在第一条前面插"以下距离超过
--        X 英里"分隔线）；
--     3. 没填邮编的排最后，按发布时间从新到旧（前端插"以下未标注位置"）。
--   另外房屋页顶栏有搜索框，选了距离之后搜索也要生效。
--
-- 改了什么：
--   - 新增 p_radius_miles（默认 null）：传了就按上面的三段排序；不传跟原来完全
--     一样（按距离从近到远，没邮编的最后）——首页"附近的二手"不受影响。
--   - 新增 p_search（默认 null）：标题或描述里包含这段文字（不区分大小写）。
--     用 strpos 做字面包含匹配，不是 LIKE，用户输入的 % _ 不会被当成通配符。
--   - 两个新参数都有默认值，已经装在手机上的旧版 App 按原来的 5 个参数调用照样能用。
--     因为加了参数，要先删掉旧的 5 参数版本再建新的，否则两个版本并存，
--     旧版 App 的调用会报"函数不唯一"。
--
-- 是否影响现有数据：不影响，只改函数。
--
-- 回滚（默认不执行）：
--   drop function if exists public.list_nearby_posts(double precision, double precision, text[], integer, integer, double precision, text);
--   然后重新执行 20261019090000_add_nearby_posts_query.sql 里的 list_nearby_posts 定义和 grant。

drop function if exists public.list_nearby_posts(double precision, double precision, text[], integer, integer);

create or replace function public.list_nearby_posts(
  p_latitude double precision,
  p_longitude double precision,
  p_category_slugs text[],
  p_limit integer default 20,
  p_offset integer default 0,
  p_radius_miles double precision default null,
  p_search text default null
)
returns table (post_id uuid, distance_miles double precision)
language sql
stable
set search_path = public
as $$
  with candidates as (
    select
      p.id,
      p.created_at,
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
      and (
        nullif(btrim(p_search), '') is null
        or strpos(lower(p.title), lower(btrim(p_search))) > 0
        or strpos(lower(coalesce(p.description, '')), lower(btrim(p_search))) > 0
      )
  )
  select c.id as post_id, c.distance_miles
  from candidates c
  order by
    -- 分段：不传范围时只分"有距离 / 没距离"两段（跟原来一样）；传了范围分三段。
    case
      when c.distance_miles is null then 2
      when p_radius_miles is null or c.distance_miles <= p_radius_miles then 0
      else 1
    end,
    -- 传了范围时，范围内的按发布时间从新到旧。
    case
      when p_radius_miles is not null and c.distance_miles <= p_radius_miles then c.created_at
    end desc nulls last,
    c.distance_miles asc nulls last,
    c.created_at desc,
    c.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.list_nearby_posts(double precision, double precision, text[], integer, integer, double precision, text) is
  '附近的帖子：只返回 id + 到帖子邮编中心点的距离（英里），不截断范围。不传 p_radius_miles 时按距离从近到远；传了时范围内按发布时间从新到旧、范围外按距离、没邮编的最后。p_search 按标题 / 描述包含过滤。';

grant execute on function public.list_nearby_posts(double precision, double precision, text[], integer, integer, double precision, text)
  to anon, authenticated;
