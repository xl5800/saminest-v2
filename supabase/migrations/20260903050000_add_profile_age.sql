-- Migration: profiles.age — 用户自己填写的年龄
--
-- 为什么改：
--   "找搭子详情页改版对齐方案图"这个大需求的第一张卡：下一张卡要在活动
--   详情页把"已加入"参与者名单展示成"昵称 + 年龄 + 城市"（比如"Kevin 25岁
--   ·住Arlington"），这张卡先把"年龄"这个字段在个人资料里补上——照抄
--   "城市"这个现成字段的实现方式：用户自己在编辑资料页选/填，
--   getMyProfile()/getPublicProfile() 把值带出来，不是系统根据什么规则
--   自动算出来的。
--
--   存成一个用户自己填写的整数字段（smallint），不是出生日期——这次任务
--   明确不需要"根据出生日期自动计算年龄"这套逻辑，用户自己填多少就存
--   显示多少，跟 location_id 是"用户自己选、按用户选的值展示"的同一个
--   模式，不涉及任何日期计算/时区处理。
--
-- 影响哪些表：
--   public.profiles 新增一列 age，可为空（默认 null，跟 bio 一样是可选
--   字段，不是必填项）。
--
-- 取值范围：13 ~ 120（含两端）。这两个数字没有跟产品逐字确认过，是这张
-- 迁移自己定的一个"明显不离谱"的合理区间，只是为了挡住负数/0/几百岁这种
-- 明显是脏数据的输入，不是在编码具体的产品/法律政策（比如平台最低使用
-- 年龄这类问题不是这张卡的范围）。前端 edit-profile-validation.ts 的校验
-- 规则必须跟这条 check 约束保持同一个区间，不能各定一套，否则前端放行的
-- 值可能在数据库这一层被拒绝，用户会看到一条数据库原始错误信息而不是
-- 友好的校验提示。
--
-- 权限：
--   不需要新的 RLS 策略。profiles_select_public_or_self（SELECT，anon +
--   authenticated 都能读未软删除的行）和 profiles_update_self（UPDATE，
--   WITH CHECK 只锁死 role/account_status 两列，见
--   20260715220000_create_profiles_table.sql 第 127-138 行）这两条已有
--   策略都是按"整行"授权、不是按列白名单，新增的 age 列自动落在这两条
--   策略的覆盖范围内——跟 profiles-repository.ts 里 updateMyProfile() 现有
--   注释描述的 bio/location_id 是同一个道理。年龄因此天然是公开信息（游客
--   通过 profiles_select_public_or_self 就能读到），不需要额外的可见性
--   开关，符合任务卡"跟城市字段同等公开程度"的要求。
--
-- 是否影响现有数据：
--   新增列默认 null，不影响任何现有行；新增的 check 约束对现有数据天然
--   满足（历史行这一列全是 null，check 约束里 `age is null or ...` 这个
--   or 分支直接放行所有 null 值）。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。

alter table public.profiles
  add column age smallint null default null;

alter table public.profiles
  add constraint profiles_age_check
    check (age is null or (age >= 13 and age <= 120));

comment on column public.profiles.age is
  '用户自己在编辑资料页填写的年龄整数，可选字段（跟 bio 一样，不填就是 null）。不是出生日期，没有任何自动计算逻辑——用户自己填多少就存/显示多少。取值范围 13~120，见 profiles_age_check。跟 location_id 同等公开程度：profiles_select_public_or_self 允许任何人（含未登录游客）读取，getPublicProfile()/getMyProfile() 都会把这一列带出来。';

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- alter table public.profiles drop constraint profiles_age_check;
-- alter table public.profiles drop column age;
