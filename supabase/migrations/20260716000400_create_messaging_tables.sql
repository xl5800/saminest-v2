-- Migration: create messaging tables (conversations / conversation_members / messages)
--
-- 为什么改：
--   建立站内消息的数据库层，对应 docs/01_Product/PRD.md 第十三章（V1 范围：
--   仅支持联系发布者，不做群聊/图片消息/已读 UI）和
--   docs/03_Database/Tables.md 第 13/14/15 节。三张表放在同一份迁移里，
--   因为它们是同一个功能、有严格的建表顺序依赖（conversations →
--   conversation_members → messages，messages 还自引用 reply_to_id），
--   分成三份文件只会增加阅读和排错成本，不会带来实际好处。
--
-- 影响哪些表：
--   新建 public.conversations / public.conversation_members /
--   public.messages。外键指向 public.posts / public.profiles（见 18 节
--   外键关系），messages.reply_to_id 自引用 messages.id。
--
-- 是否影响现有数据：
--   不影响，三张全新表，不写入任何测试数据。
--
-- 是否需要回滚方案：
--   需要。回滚 SQL 见文件末尾注释（默认不执行，需要人工确认后单独运行）。
--
-- 本次任务范围（严格按用户说明）：
--   只做数据库层（表结构 + RLS），不涉及前端代码。V1 只做纯文本消息，
--   不做图片消息、不做已读状态相关 UI——但 last_read_at / is_muted /
--   edited_at 这些字段仍然按文档保留在表结构里，只是这次没有围绕它们
--   写任何额外的同步逻辑或 UI，纯粹是"字段先按文档建好，用不用是以后的事"。
--
-- 建表/建策略顺序说明：
--   conversations 的 SELECT 策略需要联合查询 conversation_members，
--   conversation_members 的策略又需要引用 conversation_members 自己，
--   create_direct_conversation() 函数需要 conversations、
--   conversation_members、posts 三张表都已存在。为了避免"策略引用了
--   还没建出来的表"这种 42P01 报错，这份迁移分成两段：先把 conversations
--   和 conversation_members 两张表（连同各自的字段、索引、触发器）都建好，
--   再统一开 RLS、建策略、建 create_direct_conversation() 函数，最后才是
--   messages（结构和策略在同一段里，因为 messages 建表时依赖的
--   conversation_members 已经在最前面建好了，不存在这个问题）。

-- =====================================================================
-- 13. conversations（表结构）
-- =====================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct',
  post_id uuid null default null references public.posts (id),
  created_by uuid not null references public.profiles (id),
  last_message_at timestamptz null default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null default null,

  -- 13.3 节：目前只有 direct 一种会话类型在用（V1 场景是"买家联系发布者"
  -- 这种一对一私聊），文档也明确说 group 是"未来如果真正需要群聊，再增加"。
  -- 跟这个项目里其它 type/status 字段的一贯做法一样（posts.status、
  -- reports.target_type 等），只放开当前真正用得到的取值，以后要支持
  -- group 时再单独加一份迁移放宽这个约束，不提前把还用不到的值开出来。
  constraint conversations_type_check check (type in ('direct'))
);

comment on table public.conversations is
  '站内消息会话，参见 docs/01_Product/PRD.md 第十三章和 docs/03_Database/Tables.md 第 13 节。';

create index conversations_post_id_idx on public.conversations (post_id);
create index conversations_created_by_idx on public.conversations (created_by);

-- 13.4 节防重复会话的实现方式：
--
--   用户的思路是"同一帖子的卖家固定是 posts.author_id，所以对
--   (post_id, created_by) 做部分唯一索引（限定 type = 'direct'）就能防止
--   同一买家对同一帖子重复开会话，不需要联合 conversation_members 表"。
--
--   这个思路是可靠的：V1 唯一的会话创建入口就是"买家联系某个帖子的发布者"，
--   给定 post_id 之后卖家（post.author_id）是确定且不会变的（没有任何地方
--   允许修改一个帖子的 author_id），所以"买家 + 帖子"这个组合已经唯一确定
--   了"买家 + 帖子 + 卖家"这个三元组，不需要额外联表判断卖家是谁。而且
--   这是数据库层的原子约束，不会像"先查询有没有、没有再插入"那样在并发下
--   出现 TOCTOU 竞态（跟 reports 表防重复举报是同一个道理）。
--
--   在用户思路的基础上加了一个小调整：where 条件多了 deleted_at is null。
--   原因是如果只按 (post_id, created_by) 做唯一约束（不排除已软删除的行），
--   一旦某个会话被软删除（比如产品以后允许用户删除会话），这个唯一约束会
--   永久占住这个位置，买家以后再也无法就同一帖子重新联系同一个卖家——
--   这明显不是本意。加上 deleted_at is null 之后，软删除旧会话就能腾出
--   位置，允许开一个新会话，同时依然保证"任意时刻，同一买家对同一帖子
--   最多只有一个未删除的 direct 会话"。
--
--   type = 'direct' 这个条件目前看是多余的（因为 type 现在只能是
--   'direct'），但保留它是为了给未来 group 类型留出口——群聊显然不应该
--   受"买家对同一帖子只能有一个会话"这条规则约束，到时候不需要改这个索引。
create unique index conversations_direct_post_creator_unique_idx
  on public.conversations (post_id, created_by)
  where type = 'direct' and deleted_at is null;

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

-- =====================================================================
-- 14. conversation_members（表结构）
-- =====================================================================

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id),
  user_id uuid not null references public.profiles (id),
  role text not null default 'member',
  last_read_at timestamptz null default null,
  is_muted boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz null default null,

  -- 14.3 节：联合主键
  constraint conversation_members_pkey primary key (conversation_id, user_id)
);

comment on table public.conversation_members is
  '会话成员和成员状态，参见 docs/03_Database/Tables.md 第 14 节。';

-- 联合主键已经覆盖 (conversation_id, user_id) 这个访问路径；另外加一个
-- user_id 单独的索引，服务"列出我参与的所有会话"这种只按 user_id
-- 过滤的查询（主键的最左列是 conversation_id，单独按 user_id 查不会
-- 走主键索引）。
create index conversation_members_user_id_idx
  on public.conversation_members (user_id);

-- =====================================================================
-- conversations：启用 RLS + 策略
-- =====================================================================
--
-- 现在 conversation_members 已经建好了，可以安全地建引用它的策略。

alter table public.conversations enable row level security;

-- 会话 RLS 权限原则（本次任务明确给出的范围，加上后续调整——见下方
-- "会话创建入口"一节）：
--   - 只有会话成员才能读取会话（需要联合 conversation_members 判断）。
--   - 创建会话（连同插入买家/卖家两条 conversation_members 行）统一走
--     下面 create_direct_conversation() 这个 security definer 函数，
--     不给 authenticated 角色开放直接对 conversations 的 INSERT 策略。
--     原因见 conversation_members 那一节的详细说明，这里不重复。
--   - 没有 UPDATE/DELETE 策略：本次任务的 RLS 范围里没有提到谁能修改
--     会话（比如 last_message_at、软删除），所以这里不写，避免超出范围。
--     这带来一个已知的后续缺口：last_message_at 目前没有任何自动同步
--     机制（不像 favorites 对 posts.favorite_count 那样有触发器），
--     如果以后要用它做会话列表排序，需要专门加同步逻辑（多半是 messages
--     插入后的触发器），这次没有要求做这个所以没做，只在这里记录一下。

create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = auth.uid()
    )
  );

-- =====================================================================
-- conversation_members：启用 RLS + 策略
-- =====================================================================

alter table public.conversation_members enable row level security;

-- 成员表 RLS 权限原则（14.4 节 + 本次任务给出的范围）：
--   - 用户只能读取自己参加的会话的成员列表（注意是"列表"——需要能看到
--     同一会话里的其他成员，不只是自己那一行，所以用了下面这个自连接
--     EXISTS 写法：判断"当前用户是不是这一行所在会话的成员之一"，
--     而不是简单的 user_id = auth.uid()）。
--   - 用户只能更新自己的成员状态：更新只放开 last_read_at / is_muted /
--     left_at 这几个"个人状态"字段，with check 里把 conversation_id /
--     user_id（主键，理论上不该被 UPDATE 改动）和 role 钉死成跟当前行
--     一致，不允许通过这条策略被改掉——跟 posts_update_own_or_admin /
--     profiles_update_self 锁定敏感字段是同一个写法。role 目前文档没有
--     定义具体取值和管理员对应的策略，这次没有单独的角色提升场景，
--     但依然选择默认锁死、不开放自改，如果以后有正当理由需要用户自己
--     改 role，再专门放开。
--   - 不能随意把别人拉进私聊：这条要求本身意味着"插入"必须是可能的
--     （不然连合法的私聊都建不起来），但要限制"能插入谁"。
--
--     最初的方案是给 conversation_members 开一条 INSERT 策略，放开
--     "插入自己的成员行"和"会话创建者把对应帖子的作者也拉进来"这两种
--     情况。这个方案本身能工作，但有一个不直观的坑：第二种情况的策略
--     需要读 conversations 表判断"我是不是这个会话的创建者"，而读
--     conversations 又受 conversations_select_member 策略限制——必须
--     已经是会话成员才读得到。这意味着"先插买家自己的成员行，再插卖家
--     的成员行"这个顺序不能颠倒，颠倒了会因为读不到 conversations 行
--     而被拒绝，而这个限制只写在代码注释里，前端实现时很容易漏掉，
--     一旦漏掉会出现不好排查的 RLS 报错。
--
--     改成现在这个方案：不给 authenticated 角色开放任何直接对
--     conversations / conversation_members 的 INSERT 权限，创建会话
--     统一走下面这个 security definer 函数
--     public.create_direct_conversation(target_post_id)。函数内部
--     一次性完成"插入 conversations 行 + 插入买家成员行 + 插入卖家
--     成员行"这三步，因为是 security definer（属主拥有这两张表，
--     天然绕过它们的 RLS，原理跟 sync_post_favorite_count() 绕过
--     posts 的 RLS 是一样的），内部不需要经过任何 SELECT 策略去读
--     conversations，也就没有插入顺序的问题——三步在一次函数调用里
--     原子完成，前端只需要调这一个函数，不需要自己分两次插入、
--     也不需要关心顺序。
--
--     "不能随意把别人拉进私聊"这条要求由函数内部的逻辑保证，而不是
--     RLS 策略：函数只会把"调用者自己"和"目标帖子的作者"这两个人
--     加进新会话，不接受任意 user_id 参数，所以从入口上就不存在
--     "把任意其他人拉进私聊"的操作面。

create policy conversation_members_select_of_own_conversations
  on public.conversation_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members self_membership
      where self_membership.conversation_id = conversation_members.conversation_id
        and self_membership.user_id = auth.uid()
    )
  );

-- with check 里 user_id = auth.uid() 出现两次看起来像重复，其实各自的
-- 作用不一样：using() 只保证"能被这条 UPDATE 语句选中的行，改之前
-- user_id 必须等于 auth.uid()"；with check 的 user_id = auth.uid() 保证
-- "改之后 user_id 仍然必须等于 auth.uid()"。两者一起意味着 user_id
-- 改前改后都固定等于同一个 auth.uid()，也就等于 user_id 根本不可能被
-- 这条策略改动——不需要额外查询就能锁死这一列。
--
-- conversation_id 和 role 没有这种"锚定在 auth.uid() 上"的天然限制，
-- 所以用子查询去查"这一行改之前实际存的值"来锁死：子查询按 auth.uid()
-- 和这次 UPDATE 提交的新 conversation_id 去找，如果这一行的
-- conversation_id 真的被改了，子查询会在（这条 UPDATE 语句开始时的）
-- 快照里找不到"新 conversation_id + auth.uid()"这个组合，返回空，
-- 导致整个 with check 判定为空/不通过，UPDATE 被拒绝——这是 Postgres
-- RLS 里"禁止修改某一列"的标准写法，这个仓库里 posts_update_own_or_admin
-- 策略锁 favorite_count/view_count 用的是同一个技巧。
create policy conversation_members_update_self
  on public.conversation_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and conversation_id = (
      select cm.conversation_id
      from public.conversation_members cm
      where cm.user_id = auth.uid()
        and cm.conversation_id = conversation_members.conversation_id
    )
    and role = (
      select cm.role
      from public.conversation_members cm
      where cm.user_id = auth.uid()
        and cm.conversation_id = conversation_members.conversation_id
    )
  );

-- ---------------------------------------------------------------------
-- 会话创建入口：create_direct_conversation()
-- ---------------------------------------------------------------------
--
-- 唯一合法的"创建 direct 会话"方式。security definer：函数属主拥有
-- conversations / conversation_members 两张表，天然绕过它们的 RLS
-- （跟 is_admin() / sync_post_favorite_count() 是同一个原理），所以
-- 函数体内插入这两张表不受、也不需要任何 INSERT 策略。
--
-- 因为绕过了 RLS，函数自己就是安全边界，不能依赖调用者传参来确定身份：
--   - 买家身份固定取 auth.uid()，不接受调用方传入的 buyer_id 参数——
--     否则任何登录用户都能替别人发起会话，这是必须避免的越权点。
--   - 卖家身份从 target_post_id 对应帖子的 author_id 查出来，同样不接受
--     调用方直接指定"要拉谁进会话"，从入口上排除"随意拉人进私聊"的可能。
--
-- 其它设计细节：
--   - 帖子不存在或已被软删除：直接报错，不静默处理，避免建出一个
--     指向不存在帖子的会话。
--   - 卖家就是买家自己（帖子作者尝试给自己发消息）：直接报错。文档
--     没有明确写这条规则，是这次补函数时顺带加的防御性检查，如果你
--     觉得不需要这个限制，可以去掉。
--   - "get or create"语义：如果买家对这个帖子已经有一条未删除的
--     direct 会话（13.4 节防重复约束覆盖的场景），直接返回那条已有
--     会话的 id，不会报唯一约束冲突、也不会创建重复会话——用
--     on conflict ... do nothing 配合 conversations_direct_post_creator_
--     unique_idx 这个部分唯一索引实现，索引定义必须和这里的 on conflict
--     条件完全一致，以后如果改了索引条件，这里也要同步改。
--   - 两条 conversation_members 的 insert 也用了 on conflict do nothing，
--     这样即使命中"已有会话"分支，也不会因为成员行已经存在而报错，
--     整个函数在"会话已存在"和"会话不存在"两种情况下都能安全重复调用。
create or replace function public.create_direct_conversation(target_post_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_seller_id uuid;
  v_conversation_id uuid;
begin
  if v_buyer_id is null then
    raise exception 'create_direct_conversation requires an authenticated user';
  end if;

  select author_id into v_seller_id
  from public.posts
  where id = target_post_id
    and deleted_at is null;

  if v_seller_id is null then
    raise exception 'post % not found', target_post_id;
  end if;

  if v_seller_id = v_buyer_id then
    raise exception 'cannot start a direct conversation with yourself';
  end if;

  insert into public.conversations (type, post_id, created_by)
  values ('direct', target_post_id, v_buyer_id)
  on conflict (post_id, created_by)
    where type = 'direct' and deleted_at is null
  do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id into v_conversation_id
    from public.conversations
    where post_id = target_post_id
      and created_by = v_buyer_id
      and type = 'direct'
      and deleted_at is null;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (v_conversation_id, v_buyer_id),
    (v_conversation_id, v_seller_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

-- 显式收紧/授予执行权限：不依赖 Postgres 默认的 PUBLIC 执行权限，
-- 明确只允许登录用户调用，游客（anon）不能创建会话。
revoke execute on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

-- =====================================================================
-- 15. messages
-- =====================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id),
  sender_id uuid not null references public.profiles (id),
  message_type text not null default 'text',
  body text null default null,
  reply_to_id uuid null default null references public.messages (id),
  created_at timestamptz not null default now(),
  edited_at timestamptz null default null,
  deleted_at timestamptz null default null,

  -- 15.3 节名义上把 message_type 的初始值列成 text 和 system 两个，
  -- 但 15.1 节原文把"系统消息"和图片消息、撤回一起归类成"以后有明确
  -- 需求时再扩展"的功能，不是 MVP 范围；而且这个项目目前也没有任何会
  -- 产生系统消息的场景（没有群聊事件、没有管理员广播功能）。V1 明确
  -- 只做纯文本消息，这里选择只放开 'text'，不提前开放一个当前没有任何
  -- 代码会用到的 'system' 取值——这跟这个项目"不为假设的未来需求增加
  -- 复杂度"的一贯做法一致。以后如果真的要做系统消息，需要一份新迁移
  -- 放宽这个约束，并且同时补上谁/什么条件下可以插入 system 消息的 RLS
  -- （这次的 INSERT 策略是"发送者必须是自己"，系统消息显然不满足这个
  -- 前提，届时需要单独设计）。
  constraint messages_message_type_check check (message_type in ('text')),

  -- 15.4 节：body 限制 1–5000 字符。body 本身允许为空（is null or ...），
  -- 跟字段表里 body"是否为空=是"保持一致——这个约束只负责"如果填了，
  -- 长度必须在 1–5000 之间"，不负责"text 类型消息必须有 body 内容"这种
  -- 更强的业务规则（文档没有明确要求，这次没有加）。
  constraint messages_body_length_check
    check (body is null or char_length(body) between 1 and 5000)
);

comment on table public.messages is
  '站内消息正文，参见 docs/03_Database/Tables.md 第 15 节。';

-- 15.5 节索引
create index messages_conversation_id_created_at_desc_idx
  on public.messages (conversation_id, created_at desc);
create index messages_sender_id_created_at_desc_idx
  on public.messages (sender_id, created_at desc);

-- 第 22 节：启用 RLS
alter table public.messages enable row level security;

-- 15.6 权限原则（按用户给出的范围逐条实现）：
--   - 用户只能读取自己参加会话中的消息：这里没有额外要求"必须还没
--     离开会话"（left_at is null）——14.4 节原文明确写"用户离开会话后
--     是否继续保留历史记录，由产品规则决定"，属于文档自己也没定的事，
--     这次不替它做决定，只要曾经是这个会话的成员（conversation_members
--     里有这一行）就能读。
--   - 用户只能以自己身份发消息：sender_id 必须等于 auth.uid()。
--   - 发送者必须是该会话的有效成员：这里的"有效"取跟上面 SELECT 相反
--     的判断——发新消息要求 left_at is null（当前仍是活跃成员），已经
--     离开的人不应该还能继续往会话里发消息，这个和"能不能读历史记录"
--     是两个不同的问题，读的规则文档没定所以不加限制，但发送新消息
--     要求"当前有效"是 15.6 节"有效成员"这个措辞本身就能推出的，
--     不是额外发明的规则。
--   - 用户不能读取其他会话的消息：跟第一条是同一件事，靠同一条
--     SELECT 策略保证。
--   - 没有 UPDATE/DELETE 策略：15.6 节原文明确说"删除和撤回规则应由
--     产品要求明确后再实现"，这次没有这个要求，所以不写，不去猜测
--     "编辑/撤回该怎么做"这种还没定的规则。

create policy messages_select_of_own_conversations
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy messages_insert_own_as_active_member
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
        and cm.left_at is null
    )
  );

-- 回滚方案（默认不执行，需要人工确认后单独运行）：
--
-- drop policy if exists messages_insert_own_as_active_member on public.messages;
-- drop policy if exists messages_select_of_own_conversations on public.messages;
-- drop table if exists public.messages;
--
-- drop function if exists public.create_direct_conversation(uuid);
-- drop policy if exists conversation_members_update_self on public.conversation_members;
-- drop policy if exists conversation_members_select_of_own_conversations on public.conversation_members;
-- drop policy if exists conversations_select_member on public.conversations;
--
-- drop trigger if exists conversations_set_updated_at on public.conversations;
-- drop table if exists public.conversation_members;
-- drop table if exists public.conversations;
