-- 任务卡（活动详情页——发起人不能报名自己的活动）：activity_participants
-- 的 insert RLS 策略（activity_participants_insert_own，20260816175611
-- 建的，20260816175611 是唯一一次定义过这条策略）从来没有检查过"要插入
-- 这条报名行的 user_id 是不是这场活动的 organizer_id"——前端
-- use-activity-participation-action.ts 这次新增了"发起人不能报名自己的
-- 活动"这条按钮层面的禁用判断，但那只挡住了正常 UI 路径，用户绕开前端
-- 直接调用 PostgREST insert（或者以后新增的另一个入口忘记接这层判断）
-- 完全不受影响，之前这条策略本身会放行。照这个仓库一贯的"前端隐藏/禁用 +
-- 数据库也拒绝"双重保险模式（contact-seller-button.tsx 顶部注释提到的
-- 那种"数据库函数也会拒绝"的例子，还有 create_profile_conversation()
-- 里"不能给自己开会话"的检查），这里在数据库层也补上同一条限制。
--
-- 用 `a.organizer_id <> activity_participants.user_id` 而不是
-- `auth.uid()`——虽然这条策略里 user_id 已经被上面那个条件锁定成等于
-- auth.uid()，两种写法在这条策略里等价，但直接比较 user_id 更贴近"这一行
-- 到底是谁的报名记录"这个业务含义，不依赖"前面那个条件恰好也锁了
-- auth.uid()"这个实现细节，可读性更好。
--
-- 只改这一条 insert 策略，不动 select/update 策略——发起人本来就能通过
-- activity_participants_select_organizer 看到自己活动下所有参与者的行，
-- 这个可见性判断跟"能不能给自己插入一条报名记录"是两件事，任务卡也没有
-- 要求收紧发起人对现有参与者行的查看权限。

drop policy activity_participants_insert_own on public.activity_participants;
create policy activity_participants_insert_own on public.activity_participants
  for insert
  with check (
    activity_participants.user_id = auth.uid()
    and not public.is_account_restricted()
    and exists (
      select 1 from public.activities a
      where a.id = activity_participants.activity_id
        and a.deleted_at is null
        and a.status = 'open'
        and a.organizer_id <> activity_participants.user_id
        and (
          (a.requires_approval = false and activity_participants.status = 'approved')
          or (a.requires_approval = true and activity_participants.status = 'pending')
        )
    )
  );
