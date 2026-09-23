请在当前 Saminest 仓库中完成以下任务。

工作分支：请基于 origin/main 新建一个 worktree + 独立分支（例如 `git worktree add ../saminest-v2-profile-age -b feat/profile-age-field origin/main`），不要在 main 或其它任务的分支/worktree 里操作。

背景：
- 这是"找搭子详情页改版对齐方案图"这个大需求拆出来的第一张卡（第二张卡会改 `activity-detail-page.tsx`，让"已加入"参与者名单展示"昵称 + 年龄 + 城市"，比如"Kevin 25岁·住Arlington"）。第二张卡依赖这张卡先把"年龄"这个字段在个人资料里补上，所以这张卡必须先合并到 main。
- 城市（location）已经是现成字段，不需要这张卡处理：`profiles.location_id` 外键 + `编辑资料`页（`/profile/edit`，`src/pages/profile/edit-profile-page.tsx`）已经有城市下拉框，`getPublicProfile()`（`src/repositories/profiles-repository.ts`）也已经把 `locationName` 作为公开信息返回。这张卡只需要照着"城市"这个现成字段的实现方式，照猫画虎加一个"年龄"字段。
- 年龄存成一个用户自己填写的整数字段（比如 `age smallint`），不是出生日期——不需要任何"根据出生日期自动计算年龄"的逻辑，用户自己填多少就存多少、显示多少，跟"城市"字段的"用户自己选、按用户选的值展示"是同一个模式，不需要额外的日期计算/时区处理。
- 年龄这个字段填不填都可以（跟"简介"一样是可选字段），不填的账号在需要展示年龄的地方就不展示这部分文案（这张卡自己不需要处理"不展示"这部分——那是下一张改 `activity-detail-page.tsx` 的卡的事，这张卡只负责把字段本身、编辑入口、查询暴露做完整）。
- 年龄字段是公开信息（游客也能看到，因为个人主页 `getPublicProfile()`/活动详情页都是公开可见页面，这张卡新增的年龄字段要遵循"跟城市字段同等公开程度"这个既有先例，不需要加任何额外的可见性开关/隐私设置）。

目标：
1. 新建一份 migration，给 `profiles` 表加一个可为空的年龄整数列（列名 `age`，具体类型自己定，`smallint`/`integer` 都可以），加一个合理的 `check` 约束防止脏数据（比如年龄必须在一个合理区间内，具体上下限自己定一个明显不离谱的范围，不需要跟产品逐字确认这个边界）。
2. `src/repositories/profiles-repository.ts`：
   - `MyProfile`/`PublicProfile` 这两个接口加 `age: number | null`。
   - `getMyProfile()`/`getPublicProfile()` 的查询和行映射加上这一列。
   - `updateMyProfile()`（连同它的输入类型、调用它的 `useUpdateProfileMutation`）加一个可选的 `age` 参数，一次 update 里跟 displayName/bio/locationId 一起写完，不单独再开一个 mutation——照抄这三个字段现在"一次 update 全部写完"的模式。
3. `src/pages/profile/edit-profile-page.tsx`：在"城市"那个下拉框附近加一个"年龄（可选）"的数字输入框，回填/提交逻辑照抄 bio/locationId 现在的写法（`seededRef` 回填一次、`validateEditProfileInput` 校验、提交时一起传给 `updateProfileMutation`）。**视觉尺寸/样式必须跟"昵称"/"简介"/"城市"这几个现有输入框完全一致**——直接复用它们现在用的同一套 className（比如 `mt-1 w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60`，具体以文件里实际写的为准），不要另起一套更小/更窄/字号不同的样式——这一条是产品明确强调的，之前"找搭子卡片"那次改版就是因为新东西尺寸跟原有的对不上被打回来过。
4. `src/pages/profile/edit-profile-validation.ts`：加年龄的校验规则——允许留空（空字符串/未填），填了的话必须是整数、且落在这张卡第 1 步 migration 里定的那个合理区间内，超出范围给一条清楚的错误提示。

允许修改：
- 新增一个 migration 文件（`supabase/migrations/<新时间戳>_add_profile_age.sql`）。
- `src/repositories/profiles-repository.ts`
- `src/repositories/profiles-repository.test.ts`
- `src/features/profile/use-update-profile-mutation.ts`（如果需要跟着改类型签名）
- `src/pages/profile/edit-profile-page.tsx`
- `src/pages/profile/edit-profile-page.test.tsx`
- `src/pages/profile/edit-profile-validation.ts`
- `src/pages/profile/edit-profile-validation.test.ts`
- 如果 `user-profile-page.tsx`（公开主页）已经在展示 bio/locationName 这类公开字段、且你觉得顺手展示一下年龄对这次任务有意义，可以加，但不是这次任务的硬性要求——这次任务的硬性要求只到"字段本身 + 编辑入口 + 查询暴露"，个人主页要不要展示年龄可以自行判断，不强制。

禁止修改：
- `src/pages/activities/activity-detail-page.tsx`、`src/components/activity-card.tsx`、`src/components/activity-participant-avatars.tsx`、`src/repositories/activities-repository.ts`——"已加入"名单展示年龄是下一张任务卡的范围，这张卡不碰"找搭子"相关的任何文件。
- 除上面列出的文件之外的其它文件。

要求：
1. 修改前阅读：
   - docs/01_Product/PRD.md
   - docs/02_SystemDesign/Architecture.md
   - docs/03_Database/Tables.md
   - docs/04_Development/AI-Development.md
2. 先检查 git status。
3. 不覆盖现有未提交修改。
4. 不创建第二个 Supabase Client。
5. 不注册第二个 Auth listener。
6. 不创建第二个 QueryClient，不创建职责重复的 Zustand Store。
7. 数据库变化必须使用 migration。
8. 运行：
   - npm run typecheck
   - npm run test
   - npm run build
   - git diff --check
9. 不自动提交或推送。
10. 完成后报告：
    - 修改摘要
    - 文件清单
    - 验证结果
    - migration 里具体定的年龄取值范围、check 约束的具体写法
    - git status
    - 剩余风险
