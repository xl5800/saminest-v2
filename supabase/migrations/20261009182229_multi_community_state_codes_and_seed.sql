-- 阶段十三：多社区通用化。
--
-- 1. communities.state_codes：这个社区覆盖哪些州（两位大写州代码），社区浏览页
--    "附近"Tab 用它跟用户选中的州做匹配，不再在前端写死 DC/MD/VA。
-- 2. 种子数据：现有 DMV 华人社区补上 state_codes；新增 DMV 宠物社区、DMV 留学生
--    社区（两个都是非官方，is_official = false）。
--
-- RLS 确认：communities 的 SELECT 策略是行级的
-- communities_select_active_or_admin（status = 'active' OR is_admin()），表级
-- SELECT 权限授予 anon / authenticated 且没有列级 ACL，所以新增列不需要额外开
-- 策略或授权，游客和登录用户都能直接读到 state_codes。member_count 由
-- sync_community_member_count 触发器维护，新插入的行默认 0，不用手填。

alter table public.communities
  add column if not exists state_codes text[] not null default '{}';

update public.communities
set state_codes = '{DC,MD,VA}'
where slug = 'dmv';

-- 用 where not exists 而不是依赖 slug 唯一约束，保证迁移可重复执行。
insert into public.communities (name, slug, description, state_codes, is_official)
select v.name, v.slug, v.description, v.state_codes, v.is_official
from (
  values
    (
      'DMV 宠物社区',
      'dmv-pets',
      'DC / MD / VA 地区华人宠物主交流社区——遛狗搭子、兽医推荐、领养信息都可以在这里聊。',
      '{DC,MD,VA}'::text[],
      false
    ),
    (
      'DMV 留学生社区',
      'dmv-students',
      'DC / MD / VA 地区华人留学生交流社区——选课、租房、找工作、生活求助都可以在这里聊。',
      '{DC,MD,VA}'::text[],
      false
    )
) as v(name, slug, description, state_codes, is_official)
where not exists (select 1 from public.communities c where c.slug = v.slug);
