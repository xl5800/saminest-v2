# 任务卡：我的页面加简介/年龄 + 发布收藏改整行按钮 + 公开主页去 Banner + 背景再调深一档

## 对应 worktree
路径：`../saminest-v2-profile-pages-and-bg-depth2`
分支：`feat/profile-pages-and-bg-depth2`（从 `origin/main` 切出）

## 背景

BARRY 这次用 Claude Design 画了一版新 mockup（首页/找搭子/消息列表/聊天/我的/公开主页六个界面），跟真实截图反复对比、确认了几个具体改动点。这张任务卡落地其中还没做的部分（颜色 token 体系第一批已经在 `index.css`/`post-list.tsx`/找搭子卡片/`conversation-list-page.tsx`/`post-detail-page.tsx` 落地过一轮，这次不重复那部分）：

1. 背景在批次一基础上再调深一档，更明显地跟白色卡片区分开。
2. "我的"页身份卡加回简介+年龄这两行（24 号卡改版时为了精简删掉的），"我的发布/我的收藏"从身份卡内部的两栏图标按钮，改成跟"我的活动/已屏蔽"一样的整行列表按钮，挪到身份卡下面单独一张卡片。
3. 公开个人主页（`/users/:userId`）去掉 22 号卡加的 Facebook 风格深色渐变头图 banner，头像/昵称/年龄放回同一行，简介独立成一行在下面，"发布的作品"标题改成"作品"，悬浮返回/更多操作按钮的配色（本来是给深色 banner 设计的半透明黑底白字）跟着调整成浅色背景下能看清的样子。

**已经核实过、不需要再改的一点**：BARRY 一开始以为"我的"页顶部还有"我的"标题文字+设置齿轮图标需要删掉——查了 `profile-page.tsx` 当前代码，06/11 号卡早就把这个顶栏整个拆掉了，现在页面只有一个 `sr-only` 的 `<h1>我的</h1>`（给屏幕阅读器用，不可见），没有需要再删的可见标题/图标。这条任务卡不涉及这部分，如果 Codex 开工时发现代码跟这条描述不一致，先停下来跟 BARRY 确认，不要自己猜着改。

## 1. 背景颜色：`src/index.css`

`--color-bg` 从 `#f5f7fb` 改成 `#ebedf3`。这是这次改动里唯一一处颜色数值变化——这个 token 全站通用（`body { background-color: var(--color-bg); }`），首页信息流、找搭子列表、消息列表、聊天页、我的页、公开主页会跟着自动统一变灰，不需要逐页面手动改背景色。

更新 `--color-bg` 这一行上方的注释，说明这是继"背景换中性浅灰"、"视觉 Token 体系批次一"之后的第三轮背景调整，附上这次改动的原因（BARRY 用 mockup 直接跟真实截图对比过，确认背景需要更明显地跟卡片区分开），不要保留误导性的旧说明。

**不改** `--color-card`（卡片仍然是纯白 `#ffffff`，只调整背景，层次感继续靠"背景变灰 + 卡片边框投影"撑出来，不是把卡片也调灰）。

## 2. "我的"页身份卡：`src/pages/profile/profile-page.tsx` + `src/components/profile-summary.tsx`

### 2.1 加回简介 + 年龄

`ProfileSummary`（24 号卡改版后）现在不展示 bio/简介和 age/年龄。这次加回来。

**好消息，不用改数据层**：`useMyProfileQuery` 背后的 `getMyProfile()`（`src/repositories/profiles-repository.ts`）已经在查 `bio` 和 `age` 这两列，`MyProfile` 类型也已经有这两个字段——纯前端展示层改动，不用碰仓库层/类型定义。

`ProfileSummaryProps` 新增两个可选 prop：`bio: string | null` 和 `age: number | null`。渲染逻辑参照 `user-profile-page.tsx` 里 `data.bio`/`data.age` 判空渲染的写法：`bio` 为空整段不渲染，`age` 为 `null` 整行不渲染，展示成"XX 岁"文案，不做年龄段/星座这类推断。在头像/昵称/图标按钮那一行下面，紧跟着渲染这两行（`bio` 在上、`age` 在下）。

`profile-page.tsx` 调用 `ProfileSummary` 时新增 `bio={profile?.bio ?? null}` 和 `age={profile?.age ?? null}`。

### 2.2 我的发布/我的收藏：从身份卡内两栏图标 → 独立的整行列表按钮

现在这两个入口是 `profile-page.tsx` 通过 `children` 传给 `ProfileSummary` 的一个 `grid grid-cols-2 divide-x divide-border-light` 两栏区块（图标在文字上方、居中），渲染在身份卡内部、头像行下面。

这次改成跟"我的活动"/"已屏蔽"同样的整行样式——文件里已经有现成的 `GroupRow`/`GroupCard` 组件（图标在左、文字、右侧 `›` chevron），直接复用，不用新写样式：

- 新增一个 `<nav aria-label="我的发布与收藏"><GroupCard><GroupRow to="/my-posts" icon={FileText} label="我的发布" /><GroupRow to="/favorites" icon={Star} label="我的收藏" /></GroupCard></nav>`，位置放在 `<ProfileSummary>...</ProfileSummary>` 外面那个 `<div className="mb-6">` 之后、"我的内容"（`<nav aria-label="我的内容">`，我的活动/已屏蔽）那张卡片之前——单独一张卡片，不是并进"我的内容"那张里。
- `FileText`/`Star` 这两个图标 `profile-page.tsx` 顶部已经 import 过（原来给两栏区块用的），路由 `/my-posts`/`/favorites` 不变，只是从"两栏图标"换成"整行列表行"，点击行为不变。
- 删掉原来传给 `ProfileSummary` 的那个 `children`（两栏区块）。`ProfileSummaryProps.children` 这个 prop 和组件里 `{children}` 的渲染位置，这次没有调用方再用了，可以顺手一起删掉保持整洁，也可以留着不强制清理，按代码习惯自行决定，不影响验收。

## 3. 公开主页去 Banner：`src/pages/profile/user-profile-page.tsx`

### 3.1 去掉渐变头图

删掉这一块：
```tsx
<div
  data-testid="profile-cover-gradient"
  className="h-28 bg-gradient-to-b from-primary to-primary-dark"
/>
```

紧跟着包裹内容的 `<div className="bg-card"><div className="mx-auto max-w-md px-4 pb-20 text-left md:pb-6">...` 这层"整块白卡片"包装，本来是为了跟上面的渐变色块衔接、撑出悬浮效果——没有渐变色块之后不需要了，改成跟页面其它内容一样用画布默认背景（`bg-bg`，或者不显式设置直接继承 body 背景），`mx-auto max-w-md px-4 pb-20 md:pb-6` 这些横向内边距/宽度限制保留，顶部加一点 `padding-top`（比如 `pt-6`，具体数值按实际效果微调——没有渐变头图撑开顶部空间了，需要留出不被悬浮返回按钮遮住内容的空间）。

### 3.2 头像 + 昵称 + 年龄放回同一行，简介独立一行

现在的结构：
```tsx
<div className="flex items-end gap-4">
  {/* 头像：-mt-12 h-24 w-24 ring-4 ring-card，负边距+白色描边是为了压在
     banner 深浅交界线上的悬浮效果 */}
  <h1 className="min-w-0 truncate pb-1 text-xl font-bold text-text">{data.displayName}</h1>
</div>

{data.bio ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text">{data.bio}</p> : null}

{data.age !== null ? <p className="mt-1 text-sm text-text-muted">{data.age} 岁</p> : null}
```

改成：
```tsx
<div className="flex items-center gap-4">
  {/* 头像：去掉 -mt-12 和 ring-4 ring-card——那是压在 banner 交界线上的
     悬浮效果专用的，现在没有 banner 了，正常展示即可，尺寸维持 h-24 w-24
     或按实际效果改小一档都可以 */}
  <div className="min-w-0">
    <h1 className="truncate text-xl font-bold text-text">{data.displayName}</h1>
    {data.age !== null ? <p className="mt-0.5 text-sm text-text-muted">{data.age} 岁</p> : null}
  </div>
</div>

{data.bio ? (
  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text">{data.bio}</p>
) : null}
```

也就是：年龄从头像行下面单独一行，挪到跟昵称同一个文字块里（昵称在上、年龄在下）；简介保持在这一整行下面、独立成一行（这一点位置本来就是这样，只是重写整段 JSX 时要确认还在原来的相对位置，不要不小心挪到年龄上面或头像行里面）。

`isPending`/`isError`/`data === null` 那几个分支和下面的"发消息"/"屏蔽此人"按钮、`error`/`blockError` 提示不受这次改动影响，位置和逻辑都不用动。

### 3.3 "发布的作品" → "作品"

```tsx
<h2 className="mt-6 text-base font-semibold text-text">发布的作品</h2>
```
文案改成"作品"，只改这两个字，`className`、位置、下面的 `<PostList authorId={userId} />` 都不动。

### 3.4 悬浮返回/更多操作按钮配色

`FLOATING_ICON_BUTTON_CLASS_NAME`（`bg-black/50 text-white`）和 `FloatingMoreMenu` 组件内部按钮（同样的 `bg-black/50 text-white`）这两处配色是专门为了在深色渐变 banner 上保持可读性设计的——banner 去掉之后，这两个按钮会浮在浅色背景上，半透明黑底+白图标看起来会像两个灰扑扑的色块，对比度也变得奇怪。

改成浅色版本：`bg-card` 白底 + `text-text`（或 `text-text-muted`）+ 细边框（参照本文件"屏蔽此人"按钮已经在用的 `border border-border` 写法），可以加 `shadow-settings-item`（项目里已有这个 token，`profile-page.tsx` 退出登录卡片在用）撑出悬浮在内容上方的层次感。返回按钮和更多操作按钮两处都要改，保持一致。

`FloatingMoreMenu` 的下拉菜单本身（`bg-card py-1 shadow-lg` 那部分）已经是白底，不用动。

## 明确不做的事

- **不碰首页/找搭子/消息列表/聊天页的组件结构和交互逻辑**——这几个页面这次只通过 `--color-bg` 一个 token 的数值变化自动跟着背景变灰，不需要单独去改这些页面的文件。
- **不碰首页信息流卡片的图片比例/文字排版/角标**——现状已经没有"新发布"/"9成新"这类角标，价格也没有"/月"后缀，这些是 BARRY 明确不要加的东西，现状已经符合，这次不涉及卡片布局改动。
- **不改"我的"页面顶部**——当前代码已经没有可见的"我的"标题文字/设置图标（见上面"背景"部分的核实说明），这次不涉及。
- **不改 `getMyProfile`/`getPublicProfile`/`MyProfile`/`PublicProfile`**——这几列数据已经在查了，这次不涉及数据层/仓库层改动。
- **不改公开主页"发消息"/"屏蔽此人"按钮的逻辑**，只有头像/昵称/年龄那一行的结构变了，这两个按钮还在原来的相对位置。
- **不新建深色模式**。
- **不改除 `--color-bg` 以外的任何 token 数值**（`--color-card`/`--color-primary`/圆角/阴影这次都不动）。

## 验证要求

- 视觉核实：我的页面身份卡能看到简介+年龄；"我的发布/我的收藏"变成跟"我的活动/已屏蔽"一样的整行列表按钮，单独一张卡片在身份卡下面；公开主页顶部没有蓝色渐变 banner 了，头像/昵称/年龄同一行，简介独立一行在下面，标题是"作品"两个字，悬浮返回/更多按钮在浅色背景上清晰可辨。
- 背景色：首页、找搭子、消息列表、聊天、我的、公开主页几个页面背景明显比改动前更灰，卡片保持纯白，层次感更明显。
- `npm run typecheck && npm run test && npm run build` 全部通过——`profile-page.test.tsx`/`profile-summary.test.tsx`/`user-profile-page.test.tsx` 这三个文件如果有断言具体 DOM 结构/文案（比如断言"发布的作品"这几个字、断言两栏 children 区块的 class）的，按需同步更新，不代表出了其它问题。
