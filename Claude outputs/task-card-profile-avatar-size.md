# 任务卡：公开个人主页头像放大到 88px

## 对应 worktree
路径：`../saminest-v2-profile-avatar-size`
分支：`feat/profile-avatar-size`

## 背景
`user-profile-page.tsx` 这次要求头像从当前的 60px（`profile-card-interactions` 任务卡刚改的）放大到 88px，横排布局（头像+昵称+年龄胶囊同一行）不变，不带渐变头图/横幅——BARRY 已经确认过要这个方向，不是回到 22 号卡那版"Facebook 风格头图"。

## 具体改法
`src/pages/profile/user-profile-page.tsx`，头像那一段（当前）：
```tsx
            {data.avatarUrl ? (
              <img
                src={data.avatarUrl}
                alt=""
                className="h-[60px] w-[60px] shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-bg text-2xl font-semibold text-text-muted"
              >
                {avatarInitial}
              </div>
            )}
```
两处 `h-[60px] w-[60px]` 都改成 `h-[88px] w-[88px]`。首字母占位那个 `text-2xl` 字号可以按比例适当调大（比如 `text-3xl`），具体数值 Codex 自己判断哪个看起来协调，不是硬性要求。

其它都不用动：外层 `flex items-center gap-4` 的行布局、昵称+年龄胶囊、简介、发消息按钮、分割线、"作品"区块——这次只改头像尺寸这一个点。

## 明确不做的事
- 不改"我的"页身份卡（`profile-summary.tsx`）的头像尺寸——那个维持 56px 不变，这次只动公开主页这一处。
- 不引入渐变头图/横幅——BARRY 明确不要这个方向。
- 不改布局方向（不从横排改成头像居中的竖排）。

## 验证要求
- `npm run typecheck && npm run test && npm run build`，贴完整输出。
- 现有测试里如果有断言头像具体尺寸 class（`h-[60px]`/`w-[60px]`）的，要同步改成新值，不要漏改。
- 建议截一张改动后的页面截图（随便一个测试账号的公开主页）附在完工报告里，方便 BARRY 不用等真机/开发服务器就能大致看到效果。
