-- Migration: create reports table
--
-- 为什么改：
--   建立 public.reports 表，保存用户对帖子的举报（本次只做"提交举报"这一半，
--   管理员审核处理是后续后台功能任务，不在这份迁移里），对应
--   docs/01_Product/PRD.md 第十二章和 docs/03_Database/Tables.md 第 12 节。
--
-- 影响哪些表：
--   新建 public.reports，外键指向 public.profiles（reporter_id / reviewer_id，
--   见 18 节外键关系）。target_id 故意不加外键——12.1 节说明 target_type
--   未来会扩展到 profile/message 等多种对象，target_id 是"哪张表"取决于
--   target_type，18 节的外键关系列表里也确实没有把 target_id 列进去，
--   所以这是按文档故意做成的多态引用，不是遗漏。
--
-- 是否影响现有数据：
--   不影响，全新表，不写入任何测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 特别说明（发现的疑点，不是本迁移引入的问题，仅记录供参考）：
--   跑 `supabase gen types` 时发现数据库里已经存在名为 report_status /
--   report_target_type 的 Postgres 枚举类型（值和 12.4/12.5 节吻合），
--   但 Tables.md 12.2 节明确把 status / target_type 定义成 text 类型，
--   和这个项目里其它状态字段（posts.status、posts.visibility 等）的做法
--   一样——全部用 text + check 约束，没有一张表真正用 Postgres 原生枚举
--   类型。本迁移延续这个一致做法，用 text + check，没有引用/依赖那两个
--   已存在的枚举类型，也没有创建或删除它们（不确定它们是哪里来的，
--   可能是 dashboard 或别的脚本建的，不在本仓库的迁移历史里，超出这次
--   任务范围，仅记录，不处理）。

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  target_type text not null default 'post',
  target_id uuid not null,
  reason_code text not null,
  description text null default null,
  status text not null default 'pending',
  reviewer_id uuid null default null references public.profiles (id),
  resolution_note text null default null,
  reviewed_at timestamptz null default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 12.3 节：目前只支持举报帖子，未来如果要支持 profile/message 需要
  -- 新增一份迁移放宽这个约束，不在这里提前加进去。
  constraint reports_target_type_check check (target_type in ('post')),
  -- 12.4 节
  constraint reports_reason_code_check
    check (reason_code in (
      'scam', 'spam', 'duplicate', 'illegal_content',
      'misleading', 'harassment', 'privacy', 'other'
    )),
  -- 12.5 节
  constraint reports_status_check
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed'))
);

comment on table public.reports is
  '用户举报记录，参见 docs/01_Product/PRD.md 第十二章和 docs/03_Database/Tables.md 第 12 节。';

-- 12.6 节防重复规则的实现方式，以及为什么选数据库约束而不是服务层判断：
--
--   用一个"部分唯一索引"（partial unique index），只对 status 还在
--   pending/reviewing（非终结状态）的举报行生效：同一个 reporter_id 对
--   同一个 (target_type, target_id) 最多只能有一条这样的行。
--
--   选数据库约束而不是"先查询有没有、没有再插入"这种服务层判断，是因为
--   后者在并发场景下不可靠：两个请求几乎同时发起"查询-判断-插入"，都可能
--   在各自查询时看到"还没有重复记录"，然后都插入成功，产生两条重复的
--   active 举报——这是经典的 TOCTOU（check-then-act）竞态问题，客户端
--   发起的两次独立请求之间没有天然的事务隔离来防止这个情况。而部分唯一
--   索引是数据库层面原子生效的约束，不管客户端并发有多离谱都不可能被绕过，
--   由数据库来保证唯一性远比让服务层"自己记得检查一次"可靠。
--   代价是需要在应用层捕获这个唯一约束冲突（Postgres 错误码 23505），
--   转换成用户能看懂的提示，而不是让原始数据库错误直接透出去。
create unique index reports_reporter_active_target_unique_idx
  on public.reports (reporter_id, target_type, target_id)
  where status in ('pending', 'reviewing');

-- 12.7 节以外，按现有表的索引模式给举报人和被举报对象加基础索引，
-- 方便"查看自己的举报"和未来后台按 target 查询举报的场景。
create index reports_reporter_id_idx on public.reports (reporter_id);
create index reports_target_type_target_id_idx
  on public.reports (target_type, target_id);
create index reports_status_idx on public.reports (status);

create trigger reports_set_updated_at
  before update on public.reports
  for each row
  execute function public.set_updated_at();

-- 第 22 节：启用 RLS
alter table public.reports enable row level security;

-- 12.7 权限原则（本次只实现举报人视角，管理员审核策略留到后台功能任务）：
--   - 登录用户可以创建举报（reporter_id 必须是自己）。
--   - 举报人只能查看自己提交的举报，看不到别人的。
--   - "被举报内容的作者不能读取举报人身份"——这条不需要单独写策略，
--     因为 SELECT 策略本来就只放行 reporter_id = auth.uid()，帖子作者
--     如果不是举报人，本来就查不到任何一行，天然满足这条要求。
--   - 普通用户不能修改举报处理结果（status / reviewer_id /
--     resolution_note / reviewed_at）——这里直接不写任何 UPDATE 策略，
--     RLS 打开之后，没有对应策略 = 没有任何角色能 UPDATE，比"写一条
--     UPDATE 策略但把所有字段都锁死"更直接、更不容易出错。管理员的
--     UPDATE 策略等做后台审核功能时再补一条新的迁移加上，这次不写。
--   - 没有 DELETE 策略：文档没有提到举报可以被撤回/删除，这次不开放。

create policy reports_select_own
  on public.reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

create policy reports_insert_own
  on public.reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop trigger if exists reports_set_updated_at on public.reports;
-- drop policy if exists reports_insert_own on public.reports;
-- drop policy if exists reports_select_own on public.reports;
-- drop table if exists public.reports;
