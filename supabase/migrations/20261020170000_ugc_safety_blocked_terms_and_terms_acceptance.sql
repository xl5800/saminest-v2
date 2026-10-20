-- 苹果审核 1.2（用户生成内容）整改：
--
-- 1. profiles.terms_accepted_at + accept_terms()：记录用户什么时候明确同意了
--    用户协议（登录页勾选框 / 老用户第一次发内容时的弹窗都调这个函数）。
--    只记第一次同意的时间，重复调用不会覆盖。
--
-- 2. 敏感词过滤：
--    - blocked_terms：敏感词表。开 RLS 但不建任何策略——前端读不到、也改不了，
--      只有下面的 security definer 函数能读；以后增删词直接在 SQL Editor 里
--      insert / delete。
--    - normalize_moderation_text()：检查前先转小写、去掉空格和标点，防止
--      "傻 逼""f.u.c.k"这种绕过。存词的时候也用同一个函数处理，保证两边一致。
--    - contains_blocked_term()：内容里包含任何一个敏感词就返回 true。
--    - reject_blocked_terms()：通用触发器函数，参数是要检查的列名。插入时检查；
--      更新时只检查"这次改了的列"——这样管理员删除 / 下架一条在加词之前就发出
--      来的违规帖子时（只改 deleted_at / status），不会被这个检查挡住。
--      命中时报错 blocked_term，前端统一显示"内容含有不当词语，请修改"。
--    - 挂在：分类信息帖子（标题、描述、地点）、社区帖子（标题、正文）、评论、
--      找搭子活动（标题、描述、标签、地标）、私信、用户资料（昵称、简介）。
--
-- 3. 昵称保留词：reserved_display_names 里的名字（Anonymous、匿名、管理员、客服……）
--    不能用作昵称——整个昵称去掉空格标点后跟保留词完全一样才拦，"小王客服"这种
--    不拦。命中时报错 display_name_reserved。
--
-- 已有的内容不受影响：触发器只在新发 / 修改时检查。

-- ---------------------------------------------------------------------------
-- 1. 同意用户协议
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_accepted_at is
  '用户第一次明确同意用户协议（含对不良内容和滥用行为零容忍条款）的时间；null 表示还没同意过。';

create or replace function public.accept_terms()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
     set terms_accepted_at = coalesce(terms_accepted_at, now())
   where id = auth.uid()
  returning terms_accepted_at into accepted;

  return accepted;
end;
$$;

revoke all on function public.accept_terms() from public, anon;
grant execute on function public.accept_terms() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 敏感词
-- ---------------------------------------------------------------------------

create or replace function public.normalize_moderation_text(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(coalesce(input, '')),
    '[[:space:][:punct:]，。！？、；：“”‘’（）【】《》〈〉「」『』…—～·・＿－＊＃＠＆％＋＝｜＼／]+',
    '',
    'g'
  );
$$;

create table if not exists public.blocked_terms (
  id bigint generated always as identity primary key,
  term text not null,
  created_at timestamptz not null default now(),
  constraint blocked_terms_term_not_blank check (length(public.normalize_moderation_text(term)) > 0)
);

create unique index if not exists blocked_terms_normalized_term_idx
  on public.blocked_terms (public.normalize_moderation_text(term));

alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from anon, authenticated;

comment on table public.blocked_terms is
  '敏感词表（苹果 1.2 内容过滤）。前端不可读写，只有 contains_blocked_term() 读取。增删词直接在 SQL Editor 里操作。';

create table if not exists public.reserved_display_names (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists reserved_display_names_normalized_idx
  on public.reserved_display_names (public.normalize_moderation_text(name));

alter table public.reserved_display_names enable row level security;
revoke all on public.reserved_display_names from anon, authenticated;

comment on table public.reserved_display_names is
  '不能用作昵称的名字（整名匹配，去掉空格标点、不区分大小写）。';

create or replace function public.contains_blocked_term(input text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.blocked_terms t
     where strpos(public.normalize_moderation_text(input), public.normalize_moderation_text(t.term)) > 0
  );
$$;

revoke all on function public.contains_blocked_term(text) from public, anon, authenticated;

create or replace function public.reject_blocked_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  column_name text;
  new_value text;
  old_value text;
  new_row jsonb := to_jsonb(new);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
begin
  foreach column_name in array tg_argv loop
    new_value := new_row ->> column_name;
    if new_value is null or new_value = '' then
      continue;
    end if;
    if tg_op = 'UPDATE' then
      old_value := old_row ->> column_name;
      if old_value is not distinct from new_value then
        continue;
      end if;
    end if;
    if public.contains_blocked_term(new_value) then
      raise exception 'blocked_term' using errcode = 'P0001', hint = column_name;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.reject_reserved_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.display_name is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.display_name is not distinct from new.display_name then
    return new;
  end if;
  if exists (
    select 1
      from public.reserved_display_names r
     where public.normalize_moderation_text(r.name) = public.normalize_moderation_text(new.display_name)
  ) then
    raise exception 'display_name_reserved' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_reject_blocked_terms on public.posts;
create trigger posts_reject_blocked_terms
  before insert or update on public.posts
  for each row execute function public.reject_blocked_terms('title', 'description', 'location_text');

drop trigger if exists community_posts_reject_blocked_terms on public.community_posts;
create trigger community_posts_reject_blocked_terms
  before insert or update on public.community_posts
  for each row execute function public.reject_blocked_terms('title', 'body');

drop trigger if exists comments_reject_blocked_terms on public.comments;
create trigger comments_reject_blocked_terms
  before insert or update on public.comments
  for each row execute function public.reject_blocked_terms('content');

drop trigger if exists activities_reject_blocked_terms on public.activities;
create trigger activities_reject_blocked_terms
  before insert or update on public.activities
  for each row execute function public.reject_blocked_terms('title', 'description', 'tag_text', 'landmark_text');

drop trigger if exists messages_reject_blocked_terms on public.messages;
create trigger messages_reject_blocked_terms
  before insert or update on public.messages
  for each row execute function public.reject_blocked_terms('body');

drop trigger if exists profiles_reject_blocked_terms on public.profiles;
create trigger profiles_reject_blocked_terms
  before insert or update on public.profiles
  for each row execute function public.reject_blocked_terms('display_name', 'bio');

drop trigger if exists profiles_reject_reserved_display_name on public.profiles;
create trigger profiles_reject_reserved_display_name
  before insert or update on public.profiles
  for each row execute function public.reject_reserved_display_name();

-- ---------------------------------------------------------------------------
-- 3. 第一批敏感词 / 保留昵称（只收完整的词，不收单字，避免误伤正常内容）
-- ---------------------------------------------------------------------------

insert into public.blocked_terms (term) values
  -- 辱骂
  ('傻逼'), ('傻b'), ('煞笔'), ('傻屌'), ('操你妈'), ('草泥马'), ('日你妈'), ('你妈逼'),
  ('妈了个逼'), ('狗日的'), ('王八蛋'), ('婊子'), ('贱人'), ('鸡巴'), ('屌你'), ('死全家'),
  ('去死吧'),
  ('fuck'), ('motherfucker'), ('asshole'), ('bitch'), ('dickhead'), ('bastard'),
  -- 色情
  ('约炮'), ('一夜情'), ('援交'), ('裸聊'), ('黄片'), ('成人视频'), ('楼凤'), ('外围女'),
  ('莞式'), ('全套服务'), ('性服务'), ('卖淫'), ('嫖娼'),
  ('porn'), ('onlyfans'),
  -- 诈骗 / 违法交易
  ('代开发票'), ('办假证'), ('假证件'), ('假驾照'), ('洗钱'), ('刷单'), ('网赚'), ('跑分'),
  ('信用卡套现'), ('买卖银行卡'), ('出售银行卡'), ('收购银行卡'), ('出售身份信息'),
  ('网上博彩'), ('赌博网站'), ('六合彩'), ('冰毒'), ('海洛因'), ('摇头丸'), ('出售枪支'),
  ('代考'), ('代写论文'),
  -- 仇恨 / 歧视
  ('黑鬼'), ('nigger'), ('nigga'), ('faggot')
on conflict do nothing;

insert into public.reserved_display_names (name) values
  ('anonymous'), ('匿名'), ('匿名用户'), ('admin'), ('administrator'), ('管理员'), ('客服'),
  ('官方'), ('官方客服'), ('华邻'), ('华邻官方'), ('华邻客服'), ('saminest'), ('系统'),
  ('system'), ('moderator'), ('版主')
on conflict do nothing;
