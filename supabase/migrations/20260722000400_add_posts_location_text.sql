-- Migration: add posts.location_text，支持发布/编辑表单里"地区"选"其他"
-- 时的手动输入
--
-- 为什么改：
--   产品需求：发布/编辑帖子时，如果 locations 表里没有用户想要的地区，
--   允许手动输入一个自由文本地区名，而不是只能从下拉框里选。
--
--   这条需求跟 docs/03_Database/Tables.md 第 8.1 节写的设计原则有直接
--   冲突："不建议在所有帖子中完全依赖用户自由输入地区，否则后续搜索、
--   筛选和多城市扩展会变得困难"——这条原则针对的是"完全依赖自由输入"，
--   不是"提供一个覆盖长尾的兜底选项"。跟用户确认过范围：只是给"下拉框
--   里没有的地区"提供一个有地方填的兜底，不是把 locations 表这套标准化
--   地区体系废掉；location_id 外键、现有的下拉选择、以后按 location_id
--   做筛选/多城市扩展，都完全不受影响。
--
-- 影响哪些表：
--   不新建表，只给 public.posts 加一列 location_text。不改任何 RLS
--   策略——这一列跟 title/description 一样，是作者可以自由编辑的普通
--   内容字段，不属于 posts_update_own_or_admin 作者分支里"锁定不能改"
--   的那几列（status/view_count/favorite_count/rejection_reason），
--   现有策略已经允许直接改。
--
-- 修法：
--   posts.location_text，可为空，默认 null。跟 location_id 是"二选一
--   兜底"关系，不是强制关联：
--     - 选了标准地区：location_id 有值，location_text 留 null。
--     - 选"其他"手动填：location_id 为 null，location_text 有值。
--     - 两者都不填（"不限地区"）：都是 null，跟改动前完全一致。
--   不用 check 约束强制这个"二选一"关系——数据库层面允许两者同时有值
--   这种不合常规但无害的状态，应用层（发布/编辑表单）负责保证只出现
--   上面三种预期组合之一，跟这个项目里 price_amount/price_label 两个
--   跟"价格"相关的字段也是应用层保证互斥、数据库不做强制约束是同一个
--   处理方式。
--
--   长度限制参考 categories/locations 表本身的 name 字段习惯，给一个
--   宽松上限（100 字符），只是防止误粘贴长文本，不是精确的业务规则。
--
-- 是否影响现有数据：
--   现有 posts 行的 location_text 一律是 null（新列，默认值 null），
--   不影响任何已有行的 location_id 或展示。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.posts
  add column location_text text null default null,
  add constraint posts_location_text_length_check
    check (location_text is null or char_length(location_text) between 1 and 100);

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.posts
--   drop constraint if exists posts_location_text_length_check,
--   drop column if exists location_text;
