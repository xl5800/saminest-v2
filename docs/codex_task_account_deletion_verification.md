# 任务卡：账号注销功能 —— 验证与上线准备

## 背景

Claude 已经完成"注销账号"功能的完整实现（migration + repository + hooks +
页面 + 文档），详见下方"参考文件"。但这次改动有几个遗留问题需要接手：

- 涉及登录凭据和 Session（AI-Development.md 第 22 节点名的高风险类别）。
- 没能在本地跑 `npm run typecheck` / `npm run test` / `npm run build`，
  也没跑 `git status` / `git diff --check`（当时设备端 shell 环境不可用）。
- `src/types/database.generated.ts` 里新增的类型是手写的桩，不是真正跑
  `supabase gen types` 生成的。
- migration 只写了文件，没有 apply 到任何 Supabase 环境（本地、预发、
  生产都没有）。

需要 Codex 接手完成"写完代码之后、真正能安全上线之前"的这一段。

## 目标

1. 确认代码本身没有类型错误 / 测试失败 / 构建失败。
2. 在不影响生产数据的前提下，真实验证一遍"发起注销 → 撤销"、"发起注销 →
   到期清除"两条完整链路都按预期工作。
3. 确认清除后：该账号确实无法再登录、`profiles` 已正确匿名化、该账号
   历史发布的帖子/消息仍然正常显示（只是作者身份变成"已注销用户"）。
4. 产出 Barry 可以放心执行 `supabase db push` 的结论（不由 Codex 直接
   push 到生产）。

## 具体任务

### 1. 本地质量检查

- `npm run typecheck`
- `npm run test`（重点看 `account-deletion-repository.test.ts` /
  `settings-page.test.tsx` / `delete-account-page.test.tsx` 这三个新增
  测试文件是否通过）
- `npm run build`
- `git status` + `git diff --check`
- 特别检查：`src/repositories/account-deletion-repository.ts` 里
  `getSupabaseClient().rpc("request_account_deletion")` /
  `.rpc("cancel_account_deletion")` 这两处零参数 RPC 调用，在当前
  supabase-js 版本下类型是否真的能通过——这是 Claude 在报告里明确标注
  不确定的一点。

### 2. 在非生产环境验证 migration

用 `supabase db reset` 在本地跑一遍
`supabase/migrations/20260822000000_account_self_deletion.sql`，确认没有
SQL 报错（`pg_cron`/`pg_net` 是否需要额外权限、`cron.schedule` 是否成功
注册，都在这一步确认）。

> **2026-08-22 补充：Supabase 预发分支这条路暂缓，先排查本地 CLI。**
> 上一轮 Codex 反馈"当前沙盒里 `npx supabase` 报 win32-x64 找不到对应
> 二进制包，装不上 CLI"。同时确认过：这个 org（DMV Rent Platform）目前
> 是 Supabase **免费版**，官方文档没有明确写"Free 版能不能开分支"，
> Barry 决定暂时不为了验证去承担"可能被要求先升级 Pro（$25/月）"这个
> 不确定的成本，所以这次先不建预发分支。
>
> 排查 CLI 装不上的问题，按优先级试：
> 1. 确认 Node.js 版本 ≥ 20（Supabase CLI 文档写明 npx/npm 方式要求
>    Node 20+，旧版本会导致奇怪的安装失败，容易被误判成"平台不支持"）。
> 2. `npm install supabase --save-dev` 走的是本地依赖 + `npx supabase`，
>    这个方式官方文档目前仍然支持、没有废弃；如果这一步报"找不到
>    win32-x64 二进制"，大概率是这个 npm 包的 postinstall 阶段在你当前
>    沙盒里没有网络权限去 GitHub Releases 下载对应平台的二进制，不是
>    Windows 本身不支持——先确认沙盒能不能访问
>    `github.com/supabase/cli/releases`。
> 3. 换用 Scoop 安装（绕开 npm 包的 postinstall 下载逻辑）：
>    `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`
>    然后 `scoop install supabase`。
> 4. 如果沙盒环境本身就是临时/隔离的、装什么都留不住，最直接的办法是
>    **不在这个隔离沙盒里跑，改成在 Barry 本机（`C:\Users\32092\Documents\
>    Codex\saminest-v2` 所在的那台 Windows 机器）上跑这一步**——按项目
>    历史记录，Barry 之前已经通过 Scoop 装过 Supabase CLI、装过 Docker
>    Desktop，本地验证环境应该是现成的，Barry 一直以来的工作习惯也是
>    "push 前先在本地 `supabase db reset`"，这次没理由不一样。
>
> 不要为了绕开 CLI 装不上，直接把这份 migration `apply` 到
> `kdpzbpapnufvgbfgjgcr`（唯一真实项目，没有分支）去"顺便测一下"——
> 这个 migration 里的 `cron.schedule(...)` 一旦真的执行，`pg_cron` 会
> 立刻对**所有真实用户**生效，不是只影响测试账号，这正是当初选"本地
> 或预发分支"而不是"直接在正式项目上测"的原因，没有绕过这一点的安全
> 捷径。

如果以后决定要用 Supabase 预发分支（Supabase branching）验证，用现成的
QA 测试账号之一（`saminest.qa.catuser.20260720@example.com`）完整走
一遍：

1. 登录该账号，发起注销（调用 `request_account_deletion`）。
2. 确认 `account_deletion_requests` 表多了一行，`scheduled_purge_at` 是
   发起时间 + 15 天。
3. 手动执行：
   ```sql
   update account_deletion_requests
   set scheduled_purge_at = now() - interval '1 minute'
   where user_id = '<该账号 id>';
   ```
4. 手动执行一次 `select public.purge_expired_account_deletions();`。
5. 确认：
   - `profiles` 该行 `display_name` 变成"已注销用户"、`avatar_url` /
     `bio` / `location_id` 为 `null`、`account_status = 'deleted'`、
     `deleted_at` 有值。
   - `auth.users` 该行 `email` / `phone` / `encrypted_password` 为
     `null`、`deleted_at` 有值。
   - 用该账号原来的邮箱 + 密码尝试登录，确认登录失败。
   - 该账号之前发布过的帖子（如果 QA 账号没有历史帖子，先用它发一条
     测试帖子再走这个流程）仍然能在帖子列表/详情页正常显示，作者名
     显示"已注销用户"。
6. 再测一遍撤销链路：换一个账号发起注销后，在到期前调用
   `cancel_account_deletion`，确认 `cancelled_at` 有值，且账号使用不
   受影响。

### 3. 重新生成 TypeScript 类型

migration 在预发分支/本地验证通过后，用 `supabase gen types typescript`
针对已经应用了这次 migration 的环境重新生成
`src/types/database.generated.ts`，替换掉 Claude 手写的那份类型桩，
重新跑一次 `npm run typecheck` 确认无误。

### 4. 产出结论

- 一份简短的验证记录（哪一步在哪个环境跑的、结果如何），不需要写成正式
  文档，commit message 或者回复里说清楚即可。
- 明确给 Barry 一句话结论："可以 db push 到生产"或者"发现了 XX 问题，
  需要先改 XX"。

## 验收标准

- [ ] `npm run typecheck` / `npm run test` / `npm run build` 全部通过
- [ ] `git diff --check` 通过
- [ ] migration 已经在本地或 Supabase 预发分支跑通，没有 SQL 报错
- [ ] "发起注销 → 到期清除"链路验证通过（profiles 匿名化、auth.users
      无法登录、历史帖子仍显示）
- [ ] "发起注销 → 撤销"链路验证通过
- [ ] `src/types/database.generated.ts` 已经用真正跑通的
      `supabase gen types` 结果替换
- [ ] 给出明确的"能不能 push 生产"结论

## 参考文件

- `supabase/migrations/20260822000000_account_self_deletion.sql`（新增
  migration，顶部注释写了完整的设计理由）
- `src/repositories/account-deletion-repository.ts`（+ test）
- `src/features/profile/use-account-deletion-status-query.ts`
- `src/features/profile/use-request-account-deletion-mutation.ts`
- `src/features/profile/use-cancel-account-deletion-mutation.ts`
- `src/pages/settings/settings-page.tsx`（+ test）
- `src/pages/settings/delete-account-page.tsx`（+ test）
- `src/services/auth/auth-service.ts`（新增 `verifyCurrentPassword`）
- `src/router/routes.tsx`（新增 `/settings`、`/settings/delete-account`
  路由）
- `src/pages/profile/profile-page.tsx`（更新一处注释）
- `src/types/database.generated.ts`（本次手写，需要替换）
- `docs/03_Database/Tables.md` 第 37 节（账号注销功能的数据库文档）

## 备注

- 严格遵守 CLAUDE.md / `docs/04_Development/AI-Development.md` 的既有
  规则：不自动 commit/push，数据库改动走 migration，不擅自扩大任务
  范围。
- 这次任务不涉及设计/UI 改动，页面视觉已经跟现有"设置列表行"风格保持
  一致，除非验证过程中发现明显 bug。
- 如果 `npm run test` 里三个新增测试文件有失败，优先假设是 Claude 编写
  时对 mock 细节（比如 supabase-js 查询链式调用的 mock 结构）理解有误，
  照着同目录下其它已经通过的测试文件（如 `profiles-repository.test.ts` /
  `report-post-page.test.tsx`）的 mock 写法修正，而不是删掉测试。
- `pg_cron` 定时任务目前设定为每天 UTC 10:00 跑一次，如果验证阶段发现
  这个时间跟其它维护窗口冲突，可以调整，但要在报告里说明改了什么。
