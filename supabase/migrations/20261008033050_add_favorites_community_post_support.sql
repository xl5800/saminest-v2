-- 社区功能 阶段一：favorites 表支持收藏社区帖子（"赞"复用现有收藏表，不
-- 单独建 like_count 字段）。跟帖子/活动是同一张表，"恰好一个目标非空"的
-- 约束模式照抄 favorites_target_check 原来的写法，只是从两个目标扩成三个。

alter table public.favorites
  add column community_post_id uuid references public.community_posts(id);

alter table public.favorites drop constraint favorites_target_check;

alter table public.favorites add constraint favorites_target_check
  check (num_nonnulls(post_id, activity_id, community_post_id) = 1);

alter table public.favorites
  add constraint favorites_user_id_community_post_id_key unique (user_id, community_post_id);

/**
 * sync_post_favorite_count 只增加 community_post_id 这一个分支——这个函数
 * 本来就只维护 posts/community_posts 两张表各自的 favorite_count 列
 * （activities 表没有 favorite_count 列，收藏活动不走这个函数），改动前后
 * 对帖子那条路径的行为完全不变。
 */
create or replace function public.sync_post_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.post_id is not null then
      update public.posts set favorite_count = favorite_count + 1 where id = new.post_id;
    elsif new.community_post_id is not null then
      update public.community_posts set favorite_count = favorite_count + 1 where id = new.community_post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.post_id is not null then
      update public.posts set favorite_count = greatest(favorite_count - 1, 0) where id = old.post_id;
    elsif old.community_post_id is not null then
      update public.community_posts set favorite_count = greatest(favorite_count - 1, 0) where id = old.community_post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;
