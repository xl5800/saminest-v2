-- 社区功能 阶段一：sync_post_comment_count 增加 community_post_id 分支，
-- 帖子/活动原有两条路径的行为完全不变。

create or replace function public.sync_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.post_id is not null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    elsif new.activity_id is not null then
      update public.activities set comment_count = comment_count + 1 where id = new.activity_id;
    elsif new.community_post_id is not null then
      update public.community_posts set comment_count = comment_count + 1 where id = new.community_post_id;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      if new.post_id is not null then
        update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
      elsif new.activity_id is not null then
        update public.activities set comment_count = greatest(comment_count - 1, 0) where id = new.activity_id;
      elsif new.community_post_id is not null then
        update public.community_posts set comment_count = greatest(comment_count - 1, 0) where id = new.community_post_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;
