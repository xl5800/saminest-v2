# 任务卡：活动"人数上限"语义修正——上限包含发起人本人

## 对应 worktree
路径：`../saminest-v2-activity-capacity-organizer`
分支：`feat/activity-capacity-includes-organizer`（从 `origin/main` 切出）

## 背景

BARRY 发现一个真实的数字不一致 bug（截图：一个 `capacity=4` 的拼车活动，
0 个非发起人参与者，界面同时显示"共 1 人参加"和"还差 4 人（0/4）"——两句
话互相矛盾：如果发起人本来就算 1 个人，那 4 个名额里应该已经占了 1 个，
应该显示"还差 3 人"才对）。

调查结论：**`src/components/activity-participant-avatars.tsx` 里的头像格
填充逻辑（`computeSlots`）其实已经是"capacity 含发起人"这个语义**——
`joinedCount = 1 + participants.length`，`emptyCount = capacity - joinedCount`，
所以截图里头像格视觉上正确地画了 1 个发起人头像 + 3 个虚线空位（一共 4
格，等于 capacity）。**真正没跟上的只有下面这一行文字"还差 N 人"**，它调
用 `formatActivityParticipantSummary(participants.length, capacity)`——
传的是不含发起人的参与者数，函数内部也没有加回发起人这 1 人，所以用
`capacity - participants.length` 算出来的"还差"比视觉上的空位数多 1。

跟 BARRY 确认过的两条决策：
1. "人数上限"统一按"含发起人本人"理解（创建活动时填的数字 = 活动总人数，
   不是"除自己以外还需要多少人"）——`activity-participant-avatars.tsx` 的
   头像格逻辑已经是这个语义，这次是让文字提示和数据库的"满员"判断跟上。
2. **不迁移已有活动的 `capacity` 数值**——只改这次新写的逻辑，老活动的
   "还差 N 人"文字会因为语义变化自然少算 1 人（比如原来显示"还差 6
   人"的活动，这次改完会显示"还差 5 人"），这是 BARRY 确认接受的结果，
   不需要额外写数据回填的迁移。

## 每个文件的要求

### 1. `src/utils/format.ts` —— `formatActivityParticipantSummary`

把发起人算进"已加入人数"里再计算"还差"和"M/N"这两个数字，跟
`activity-participant-avatars.tsx` 的 `computeSlots` 用的是同一个
`joinedCount = 1 + 参与者数` 口径保持一致。**函数签名不用改**（两个调用方
`activity-participant-avatars.tsx`/`my-activities-page.tsx` 传进来的还是
"不含发起人的参与者数"，在函数内部加 1 即可，不用改调用方代码）：

```ts
export function formatActivityParticipantSummary(
  participantCount: number,
  capacity: number | null
): string {
  const joinedCount = participantCount + 1; // +1：发起人本人
  if (capacity === null) {
    return `已有 ${joinedCount} 人报名`;
  }

  const remaining = Math.max(capacity - joinedCount, 0);
  return remaining > 0
    ? `还差 ${remaining} 人（${joinedCount}/${capacity}）`
    : `已满员（${joinedCount}/${capacity}）`;
}
```

（`capacity === null` 分支原来的文案"已有 X 人报名"里的 X 之前也是不含
发起人的，这次一并改成含发起人的 `joinedCount`——理由跟上面加 1 一样，
统一口径，不要一个分支含发起人一个分支不含。）

更新函数顶部的文档注释，说明这次改动和原因（可以直接引用这份任务卡的
"真正没跟上的只有这一行"那段话）。

**同时检查并更新** `src/utils/format.test.ts` 里 `formatActivityParticipantSummary`
的现有用例——原来的断言是按"不含发起人"算的，这次全部要 +1 调整（包括
`capacity === null` 那个分支的断言）。

### 2. `supabase/migrations/` —— 新迁移：`sync_activity_participant_count()` 满员判断

`20260816175611_activity_join_approval.sql` 里定义的
`sync_activity_participant_count()` 触发器函数，用
`participant_count >= capacity` 判断要不要把活动状态切到 `'full'`，
`participant_count < capacity` 判断要不要从 `'full'` 切回 `'open'`——这两个
条件里的 `participant_count` 都是不含发起人的（触发器只统计
`activity_participants` 表里已批准的行，发起人本来就不在这张表里）。这次
两个条件都要加 1（发起人）再比较，语义上等价于"发起人 + 已批准参与者数
>= capacity"：

```sql
create or replace function public.sync_activity_participant_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  old_counted boolean := false;
  new_counted boolean := false;
  delta integer := 0;
begin
  if tg_op = 'INSERT' then
    new_counted := (new.status = 'approved' and new.cancelled_at is null);
    delta := case when new_counted then 1 else 0 end;
  elsif tg_op = 'UPDATE' then
    old_counted := (old.status = 'approved' and old.cancelled_at is null);
    new_counted := (new.status = 'approved' and new.cancelled_at is null);
    delta := (case when new_counted then 1 else 0 end) - (case when old_counted then 1 else 0 end);
  end if;

  if delta <> 0 then
    update public.activities
    set participant_count = greatest(participant_count + delta, 0),
        status = case
          when capacity is not null and greatest(participant_count + delta, 0) + 1 >= capacity and status = 'open' then 'full'
          when capacity is not null and greatest(participant_count + delta, 0) + 1 < capacity and status = 'full' then 'open'
          else status
        end
    where id = coalesce(new.activity_id, old.activity_id);
  end if;

  return new;
end;
$$;
```

（只改了 `>= capacity` / `< capacity` 这两处，各加了 `+ 1`，函数其它部分
原样保留，照抄 `20260910120000_activity_participants_block_organizer_self_join.sql`
那种"drop+recreate/create or replace，只改一个条件、写清楚改了什么、为什么"
的迁移注释风格。）

写完之后**先在本地或者用 `execute_sql` 之类的方式实际验证过再说已验证**，
不要只凭代码审查——具体验证哪几种场景由你判断（至少应该覆盖：capacity
刚好等于"发起人+已批准参与者"时状态切到 full；有人取消报名后状态从 full
切回 open 的边界）。

### 3.（可选，你自行判断要不要做）`src/pages/activities/create-activity-page.tsx`

"人数上限"这个输入框上方的说明文字目前是"人数上限（不填表示不限）"
（第 422 行附近），语义变成"含发起人"之后，这句提示可能会让人以为"上限"
不含自己，建议改成"人数上限（含你自己，不填表示不限）"或类似措辞，
让发起人创建活动时不会填错数字。这条不是硬性要求，你觉得有没有必要加、
措辞怎么写，自己判断。

## 明确不做的事

- **不迁移已有活动的 `capacity` 数值**——这是 BARRY 明确确认的决定，老
  活动的"还差 N 人"显示会因为语义变化直接少 1，不需要额外写迁移把老数据
  的 capacity 批量 +1。
- 不改 `computeSlots`/头像格视觉逻辑——它已经是正确的"含发起人"口径，
  这次改动之后应该跟头像格的空位数完全对得上，验收标准里会检查这一点。
- 不改"发起人不能报名自己活动"那部分逻辑（上一张卡已经做完，这次不碰
  `use-activity-participation-action.ts`/相关 RLS）。
- 不做"创建活动时 capacity 必须 >= 2"这类额外校验——`capacity=1`（意味着
  "只有发起人自己，谁都不能报名"）理论上存在一个边界情况：活动创建时
  `status` 默认是 `'open'`，直到第一次有人真的报名触发上面那个触发器才会
  被动切成 `'full'`，也就是说 `capacity=1` 的活动在真正有人点击报名之前，
  报名按钮不会被禁用（这个边界情况今天用旧语义时也存在，不是这次改动新
  引入的）。这次不特意处理这个边界情况，如果你在实现过程中觉得有更顺手
  的方式顺带修掉（比如创建活动时 capacity<=1 直接把初始 status 设成
  full），可以做，但不是这次任务卡的硬性要求。
- 不做"每个活动帖子下方加留言区"——BARRY 已经说了这次先不做，这张卡完全
  不涉及。

## 验收标准

- 截图里的场景（capacity=4，0 个已批准参与者）现在应该显示"还差 3
  人（1/4）"，跟头像格的"1 个发起人头像 + 3 个虚线空位"对得上。
- `formatActivityParticipantSummary` 的所有分支（`capacity === null` /
  还有剩余名额 / 刚好满员）都按"含发起人"的口径重新验证过，`format.test.ts`
  里对应用例全部更新并通过。
- `sync_activity_participant_count()` 触发器改完之后，满员/取消报名切回
  open 的边界都实际验证过（不是只读代码），并在完工报告里写清楚具体怎么
  验证的。
- `npm run typecheck && npm run test && npm run build` 全部通过。
- 迁移文件本地/用 `execute_sql` 验证通过后再合并；生产库的迁移应用交给
  BARRY 这边在合并后统一处理，不需要你自己调用任何直接改生产库的工具。
