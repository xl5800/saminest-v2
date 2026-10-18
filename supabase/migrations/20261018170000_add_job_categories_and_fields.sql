-- Migration: 招聘求职分类 + 帖子的工作字段
--
-- 为什么改：
--   首页改版（招聘求职 / 房屋租售 / 二手闲置 / 找搭子 四个标签），"招聘求职"
--   排第一个、默认打开。现在数据库里没有工作相关的分类，帖子也没有地方存
--   "时薪还是月薪""全职还是兼职""包不包吃住"——这些是工作帖列表里最先要看
--   的信息（参照华人168 / Indeed 的工作列表）。
--
-- 影响哪些表：
--   1. public.categories 新增两行：hiring（招聘）、job-seeking（求职）。跟现有
--      "租房 rent / 求租 wanted"是同一个"一种帖子一个分类"的做法，不新建
--      "帖子子类型"字段。sort_order 4、5 排在现有三个分类后面（首页标签的
--      顺序由前端决定，不读这个字段）。
--   2. public.posts 新增三列，只有工作帖会填，其它分类的帖子保持 null / 空：
--      - salary_unit：薪资单位 hour（时薪）/ day（日薪）/ month（月薪）/
--        year（年薪）。薪资数字继续用现有的 price_amount；"面议"继续用现有的
--        price_label（formatPrice 已经是"有 price_label 就显示它"）。
--      - employment_type：full_time（全职）/ part_time（兼职）/ either（全职
--        兼职都可以）。
--      - job_perks：福利标签数组，只允许 meals（包吃）、housing（包住）、
--        training（可培训）；默认空数组。
--
--   RLS：不需要改。posts 现有的 select / insert / update 策略按行判断
--   （作者本人、审核状态、账号状态），不按列，新列跟着现有规则走：作者能写
--   自己帖子的这三列，别人只能读审核通过的帖子。categories 只有管理员能写，
--   这里在 migration 里直接插入。
--
-- 是否影响现有数据：
--   不修改任何现有行。现有帖子三列为 null / 空数组。
--
-- 是否需要回滚方案：
--   需要，见文件末尾注释（默认不执行）。注意：回滚会删掉两个分类，如果那时
--   已经有人发了工作帖，要先处理那些帖子（posts.category_id 外键）。

-- ---------------------------------------------------------------------
-- 1. 分类
-- ---------------------------------------------------------------------
insert into public.categories (slug, name_zh, name_en, sort_order, is_active)
values
  ('hiring', '招聘', 'Hiring', 4, true),
  ('job-seeking', '求职', 'Job seeking', 5, true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2. 帖子的工作字段
-- ---------------------------------------------------------------------
alter table public.posts
  add column salary_unit text,
  add column employment_type text,
  add column job_perks text[] not null default '{}';

alter table public.posts
  add constraint posts_salary_unit_check
    check (salary_unit is null or salary_unit in ('hour', 'day', 'month', 'year')),
  add constraint posts_employment_type_check
    check (employment_type is null or employment_type in ('full_time', 'part_time', 'either')),
  add constraint posts_job_perks_check
    check (job_perks <@ array['meals', 'housing', 'training']::text[]);

comment on column public.posts.salary_unit is
  '工作帖的薪资单位：hour/day/month/year；数字在 price_amount，面议写在 price_label。其它分类为 null。';
comment on column public.posts.employment_type is
  '工作帖：full_time 全职 / part_time 兼职 / either 都可以。其它分类为 null。';
comment on column public.posts.job_perks is
  '工作帖福利：meals 包吃 / housing 包住 / training 可培训。其它分类为空数组。';

-- ---------------------------------------------------------------------
-- 回滚（默认不执行；执行前先确认没有工作帖，或先把它们处理掉）
-- ---------------------------------------------------------------------
-- alter table public.posts
--   drop constraint if exists posts_job_perks_check,
--   drop constraint if exists posts_employment_type_check,
--   drop constraint if exists posts_salary_unit_check;
-- alter table public.posts
--   drop column if exists job_perks,
--   drop column if exists employment_type,
--   drop column if exists salary_unit;
-- delete from public.categories where slug in ('hiring', 'job-seeking');
