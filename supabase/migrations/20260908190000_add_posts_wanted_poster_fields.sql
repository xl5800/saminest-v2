-- Migration: posts.poster_age / posts.poster_gender —— 求租板块改版第一步
--
-- 为什么改：
--   求租板块改版（31 号卡）的预览卡片要展示发帖人的"性别/年龄"这两项信息
--   （比如"男 · 25岁"），发布表单在选中"求租"分类时也要让发帖人自己填这
--   两个字段——照抄 profiles.age（见
--   20260903050000_add_profile_age.sql）的模式：用户自己填多少就存/展示
--   多少，不是系统根据什么规则自动算出来的，也不是从 profiles.age 引用
--   过来的外键/只读值——这条帖子自己的 poster_age 从新建时开始就是一份
--   独立数据，用户发帖时手动改这个字段不会回写 profiles.age，两者从这一刻
--   起互不影响（跟"标题/描述这些字段各自独立，不是引用"是同一个道理）。
--
--   命名为什么是 poster_age/poster_gender 而不是直接叫 age/gender：这张
--   表（posts）以后完全可能出现别的"年龄类"字段（比如"对室友年龄的要求"
--   这种针对求租对象、不是发帖人自己的年龄），提前用 poster_ 前缀把"这是
--   发帖人自己的年龄/性别"这个语义锁死，避免以后命名互相打架。
--
-- 影响哪些表：
--   public.posts 新增两列：
--   - poster_age smallint，可为空（默认 null，跟 profiles.age 一样是可选
--     字段，不是必填项）。
--   - poster_gender text，可为空（默认 null）。
--
--   两列都是全表通用的可空列，不是只有 wanted 分类的帖子才有——跟
--   price_amount/contact_method 这些字段是同一个模式：列本身对所有分类
--   通用，只是非求租分类的帖子这两列永远是 null，由应用层的发布表单决定
--   什么时候真正写入值，不靠数据库层面的分类专属约束（Postgres 的 check
--   约束没有"仅当另一列等于某个值时才生效"这种条件式写法，勉强用
--   `category_id <> 'wanted 的 id' or poster_age is not null` 这种 check
--   反而会让"求租必须填年龄"这种产品规则跟一个具体的分类 UUID 耦合在
--   一起、迁移文件里出现一个写死的业务数据主键值，属于过度设计；这次任务
--   也明确是"可选、不强制"，不需要这种约束）。
--
-- 取值范围：
--   poster_age：13 ~ 120（含两端），跟 profiles_age_check（
--   20260903050000_add_profile_age.sql）完全一致——前端 publish-validation.ts
--   的校验规则直接复用同一对 MIN_AGE/MAX_AGE 常量（从
--   edit-profile-validation.ts 导入，不再定义第二份），不能各定一套，否则
--   前端放行的值可能在数据库这一层被拒绝，用户会看到一条数据库原始错误
--   而不是友好的校验提示。这两个数字本身没有跟产品逐字确认过，是"明显不
--   离谱"的合理区间，用来挡负数/0/几百岁这种脏数据，不是在编码具体的
--   产品/法律政策（比如平台最低使用年龄这类问题不是这张迁移的范围）。
--
--   poster_gender：'男' / '女' / '不透露' 三选一，跟发布表单的单选选项
--   逐字对应。
--
-- 权限：
--   不需要新的 RLS 策略。posts_select_public_or_own_or_admin（SELECT）和
--   posts_update_own_or_admin（UPDATE）都是按整行授权（见
--   20260715220300_create_posts_table.sql），新增列自动落在这两条策略的
--   覆盖范围内——跟 profiles.age 那次迁移的结论完全一样。
--
-- 是否影响现有数据：
--   新增列默认 null，不影响任何现有行；新增的两条 check 约束对现有数据
--   天然满足（历史行这两列全是 null，check 约束里 "xxx is null or ..."
--   这个 or 分支直接放行所有 null 值）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.posts
  add column poster_age smallint null default null;

alter table public.posts
  add column poster_gender text null default null;

alter table public.posts
  add constraint posts_poster_age_check
    check (poster_age is null or (poster_age >= 13 and poster_age <= 120));

alter table public.posts
  add constraint posts_poster_gender_check
    check (poster_gender is null or poster_gender in ('男', '女', '不透露'));

comment on column public.posts.poster_age is
  '发帖人自己填写的年龄整数，可选字段（跟 profiles.age 一样，不填就是 null）。这是这条帖子自己的一份独立数据——发新帖时默认从 profiles.age 带出来当初始值，但用户手动改这个字段之后不会回写 profiles.age，两者从此互不影响。取值范围 13~120，见 posts_poster_age_check，必须跟 profiles_age_check 保持同一个区间。';

comment on column public.posts.poster_gender is
  '发帖人自己选择的性别，可选字段，三选一（男/女/不透露），见 posts_poster_gender_check。目前只有"求租"分类的发布表单会展示这两个字段的输入框，但列本身对所有分类通用（跟 price_amount 是同一个模式），不靠数据库层面的分类专属约束。';

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.posts drop constraint posts_poster_gender_check;
-- alter table public.posts drop constraint posts_poster_age_check;
-- alter table public.posts drop column poster_gender;
-- alter table public.posts drop column poster_age;
