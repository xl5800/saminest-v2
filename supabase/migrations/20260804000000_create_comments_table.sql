-- Migration: create comments table
--
-- 为什么改：
--   建立 public.comments 表，支持帖子详情页评论功能——用户可以对帖子发表
--   评论，也可以对评论发表回复（parent_id 自引用，真正无限层级嵌套，
--   不是摊平成两层）。这是一个新功能，不在当前 PRD.md 里，按项目文档
--   （Tables.md 第 31 节）新模块流程的判断：这属于"扩展现有 posts 模型"
--   而不是独立的"论坛"模块（那个未来会用 community_posts/community_comments
--   这种独立表名），所以直接在现有 posts 上加一张关联表，不需要走论坛级别
--   的独立表设计。Tables.md 会在后续迁移/前端任务完成后补一节文档。
--
-- 影响哪些表：
--   新建 public.comments，外键指向 public.posts / public.profiles /
--   自引用 public.comments（parent_id）。
--   不修改任何现有表结构（posts.comment_count 冗余计数字段和触发器放在
--   下一份迁移里单独处理，reports 表支持举报评论也是单独一份迁移）。
--
-- 是否影响现有数据：
--   不影响，全新表，不写入任何测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 软删除而不是硬删除：
--   评论之间用 parent_id 形成回复链，如果允许硬删除，删掉一条被回复过的
--   评论会让子回复变成孤儿（parent_id 指向一条不存在的行）。这个仓库已经
--   在 post_images/feedback_images 上吃过"软删除处理不当导致数据完整性
--   问题"的教训，这次直接用软删除：删除只是把 deleted_at 设置成当前时间，
--   前端对已删除的评论展示"该评论已删除"占位文字，回复链不断。
--
--   删除通过 UPDATE 实现（而不是真正的 DELETE），所以下面的
--   comments_delete_own 策略实际上是一条 UPDATE 策略，命名成 delete 是为了
--   语义上跟"用户删除自己评论"这个动作对应，不是这张表真的有 DELETE 策略。

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id),
  user_id uuid not null references public.profiles (id),
  parent_id uuid null default null references public.comments (id),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null default null,

  -- 内容长度限制：跟 feedback.content 是同一个"用数据库约束固定业务规则"
  -- 的做法（见 create_feedback_tables 迁移），上限 500 字，评论比反馈内容
  -- 更短，1-500 足够覆盖正常使用，同时防止恶意超长内容。
  constraint comments_content_length_check
    check (char_length(content) between 1 and 500)
);

comment on table public.comments is
  '帖子评论/回复，parent_id 自引用实现无限层级嵌套，软删除（deleted_at）保留回复链完整性。';

-- 索引：按 post_id 查一个帖子下的所有评论是最主要的查询模式（一次性拉全部、
-- 前端自己拼树，见前端任务说明，这个体量不需要分页），按 created_at 升序
-- 排（自然的对话时间顺序）；parent_id 单独加索引方便按需要查某条评论的
-- 直接回复。
create index comments_post_id_created_at_idx
  on public.comments (post_id, created_at asc);
create index comments_parent_id_idx on public.comments (parent_id);
create index comments_user_id_idx on public.comments (user_id);

create trigger comments_set_updated_at
  before update on public.comments
  for each row
  execute function public.set_updated_at();

-- 第 22 节：启用 RLS
alter table public.comments enable row level security;

-- 权限原则（照抄 post_images 的"已审核公开帖子 或 帖子作者本人"可见性判断
-- 模式，见 create_post_images_table 迁移）：
--   - 所有人（含未登录）可以查看"已审核公开且未软删除"帖子下的评论，
--     以及帖子作者本人任何状态帖子下的评论。
--   - 登录用户可以对"自己能看到评论的帖子"发表评论/回复，且账号不能处于
--     受限状态（is_account_restricted()，跟 posts/reports/messages 的
--     insert 策略一致，见 account_status_enforcement 迁移）。parent_id
--     如果不是空，必须指向同一个 post_id 下的已有评论——防止跨帖子伪造
--     回复关系破坏树结构。
--   - 用户只能"软删除"自己的评论（通过 UPDATE 把 deleted_at 设成
--     当前值），且只能删除还未被删除的评论；with check 锁死其余所有
--     字段必须保持不变（post_id/user_id/parent_id/content 都不能在这次
--     UPDATE 里被顺带改掉），只放行 deleted_at 这一列——跟 profiles_update_self
--     锁 role/account_status 是同一个思路，只是这里反过来（锁住除了
--     deleted_at 以外的一切，而不是只锁两个字段）。
--   - 没有开放"编辑评论内容"的策略——文档/需求都没有提到编辑评论这个
--     功能，不在这次范围内。

create policy comments_select_of_approved_or_own_posts
  on public.comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.status = 'approved'
        and p.visibility = 'public'
        and p.deleted_at is null
    )
    or exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.author_id = auth.uid()
        and p.deleted_at is null
    )
  );

create policy comments_insert_own
  on public.comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_account_restricted()
    and exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.deleted_at is null
        and (
          (p.status = 'approved' and p.visibility = 'public')
          or p.author_id = auth.uid()
        )
    )
    and (
      parent_id is null
      or exists (
        select 1
        from public.comments c
        where c.id = comments.parent_id
          and c.post_id = comments.post_id
      )
    )
  );

create policy comments_delete_own
  on public.comments
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and deleted_at is null
  )
  with check (
    user_id = (select c.user_id from public.comments c where c.id = comments.id)
    and post_id = (select c.post_id from public.comments c where c.id = comments.id)
    and parent_id is not distinct from (select c.parent_id from public.comments c where c.id = comments.id)
    and content = (select c.content from public.comments c where c.id = comments.id)
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists comments_delete_own on public.comments;
-- drop policy if exists comments_insert_own on public.comments;
-- drop policy if exists comments_select_of_approved_or_own_posts on public.comments;
-- drop trigger if exists comments_set_updated_at on public.comments;
-- drop table if exists public.comments;
