# 任务卡：修复 `is_blocked_pair()` 任意用户对查询漏洞（合并前必须修）

## 背景

Card 12（屏蔽用户功能）代码审查时发现一个设计层面的权限漏洞，涉及
`supabase/migrations/20260822020000_enforce_user_blocks_in_messaging.sql`
里新增的 `is_blocked_pair(user_a uuid, user_b uuid)` 函数。

这个函数是 `security definer`，且按设计**没有**收紧执行权限（迁移里的
理由是"故意维持 PUBLIC 权限，方便前端直接 `.rpc()` 调用"）。问题在于它
接受两个完全任意的 `user_a`/`user_b` 参数，没有绑定到调用者身份
（`auth.uid()`）——也就是说任何登录用户（甚至可能包括 `anon` 角色，取决
于默认的 PUBLIC 执行权限）都可以拿两个跟自己毫不相关的用户 id，直接调
`supabase.rpc("is_blocked_pair", {user_a: X, user_b: Y})`，打听"X 有没有
屏蔽 Y"。

这跟同一份迁移在 `user_blocks` 表 RLS 设计上的意图直接矛盾——那部分明确
写的是"不通过表本身的 RLS 暴露给任何角色，包括被屏蔽的那一方自己"。这个
RPC 函数把这道边界完全绕开了，而且不止是让被屏蔽者知道自己被屏蔽，是让
**任何人查任意一对用户**之间的屏蔽关系，可以被用来做社交图谱意义上的
窥探（比如挨个试 profile id，摸清楚谁屏蔽了谁）。

好消息：调用点排查过了，`is_blocked_in_conversation()`、三个
`create_*_conversation()` 函数、前端 `useIsBlockedPairQuery` /
`user-blocks-repository.ts` 的 `isBlockedPair()`，全部都是拿"当前登录
用户 + 另一个人"在查，从没真的用来查两个不相关第三方。所以修法是纯粹
收紧签名，不影响任何现有行为。

## 要求

1. 新增一份 migration（不要改已有的 `20260822020000` 文件本身——它已经
   在评审阶段，改成 `create or replace`/`drop function` 走新文件，保留
   修复过程可追溯），把函数改成单参数、内部绑定 `auth.uid()`：

   ```sql
   create or replace function public.is_blocked_with(other_user_id uuid)
   returns boolean
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select exists (
       select 1
       from public.user_blocks
       where (blocker_id = auth.uid() and blocked_id = other_user_id)
          or (blocker_id = other_user_id and blocked_id = auth.uid())
     );
   $$;
   ```

   函数名和参数名按你判断的最小改动量来定（可以叫 `is_blocked_with`，也
   可以保留 `is_blocked_pair` 这个名字、把签名从两参数改成一参数）——
   两种都可以，你决定哪种改动面更小、更符合仓库现有命名习惯。

2. 老的两参数版本 `is_blocked_pair(uuid, uuid)` 用 `drop function` 删掉，
   不要留着新旧两个函数并存。

3. 跟着改调用点，全部改成新签名：
   - `is_blocked_in_conversation()` 内部调用处
   - `create_direct_conversation()` / `create_profile_conversation()` /
     `create_activity_conversation()` 三处调用
   - `src/repositories/user-blocks-repository.ts` 的
     `isBlockedPair(userA, userB)` 及其 `.rpc()` 调用——前端调用方
     （`useIsBlockedPairQuery` 等）如果因为函数签名变化需要跟着改调用
     方式，一并改掉。

4. 本地 `supabase db reset` 验证：用两个测试账号 A、B，A 屏蔽 B 后，用
   跟 A、B 都无关的第三个账号 C 尝试查 A 和 B 之间的屏蔽关系，应该
   失败或查不到（而不是能查到 true/false）；A 或 B 自己查"我和对方"的
   关系应该正常返回正确结果。

5. 运行 `npm run typecheck` / `npm run test` / `npm run build` /
   `git diff --check`，确认全部通过（Card 12 原有的测试也要跟着新签名
   一起过）。

6. 不自动提交或推送。完成后按老规矩回复：改了什么、验证结果、剩余风险
   （如果有）。

## 参考文件

- `supabase/migrations/20260822020000_enforce_user_blocks_in_messaging.sql`
  （问题所在的迁移，新文件里 `is_blocked_pair` 的定义和三处调用可以照抄
  上下文）
- `src/repositories/user-blocks-repository.ts`（`isBlockedPair()`）
- `src/features/blocks/use-is-blocked-pair-query.ts`

## 备注

- 这是 Card 12（屏蔽用户）验收前必须修的问题，不是可以先合并再补丁的
  级别——`is_blocked_pair` 目前还没有推到生产数据库（本地 migration 文件
  已经从待 push 队列里临时移出，不会被这一轮 `db push` 带上去），所以
  现在修不涉及线上数据/权限收紧的兼容性问题，改起来没有历史包袱。
- 严格遵守 CLAUDE.md / `docs/04_Development/AI-Development.md` 的既有
  规则：不自动 commit/push，数据库改动走 migration，不擅自扩大任务
  范围。
