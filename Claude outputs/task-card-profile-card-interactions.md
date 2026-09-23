# 任务卡："我的"页身份卡整卡可点 + 用户主页头部改版（返回/更多同行、头像缩小、年龄胶囊、屏蔽移入更多菜单、发消息满宽）

## 对应 worktree
路径：`../saminest-v2-profile-card-interactions`
分支：`feat/profile-card-interactions`（从 `origin/main` 切出）

跟同一批的另一张任务卡《地区筛选栏暂时只精确到州》（`feat/region-filter-state-only`，只改 `region-select-page.tsx`）完全没有文件交集，可以并行开工，不用互相等。

## 背景

BARRY 用 Claude Design 又画了一版新 mockup，在上一张任务卡（加回简介/年龄、去 Banner）基础上继续细化"我的"页身份卡和公开主页头部的交互/样式。这张卡落地这一轮的改动。

## 1. "我的"页身份卡：`src/components/profile-summary.tsx`

### 1.1 去掉右上角图标按钮，整卡可点进公开主页

现在卡片右上角有个圆形图标按钮（`profileHref` 存在时渲染，`UserRound` 图标），BARRY 一开始以为这是"头像加载失败的占位图标"，反馈"不知道是干嘛的、跟真实头像叠在一起显得乱"——这次把它去掉，改成整张卡片可点（点击任意空白区域，包括头像和文字，都跳到 `profileHref`），右侧加一个 `›` 箭头（`ChevronRight`，`lucide-react` 已经在项目里到处在用，直接 import）提示"这一整块可点"。

**头像右下角另外要加一个铅笔编辑角标**（见 1.2），它的点击目标是 `/profile/edit`，跟整卡的 `profileHref` 目标不一样——所以整卡不能简单包一层 `<Link to={profileHref}>`（会导致铅笔角标嵌套在这个 `<Link>` 内部，点铅笔也会触发外层跳转，且 `<a>` 标签本身不允许嵌套）。改成：

- 最外层容器从 `<div>` 改成可点击的容器（比如 `<div role="link" tabIndex={0} onClick={...} onKeyDown={...}>`，或者用 `useNavigate()` 写一个 `handleCardClick`），`profileHref` 存在时才挂这些可点击属性/onClick，不存在时维持纯展示（跟现在 `profileHref?` 是可选 prop 的语义一致）。
- 铅笔角标是内部单独的一个可点击元素（`<Link to="/profile/edit">` 或 `<button onClick={...}>`），点击时调用 `event.stopPropagation()`，防止事件冒泡触发外层整卡的点击。
- 右侧箭头（`ChevronRight`）只是纯视觉提示，不需要自己的点击行为，`profileHref` 存在时渲染，不存在时不渲染（维持跟原来 `profileHref ?` 判断一致的显隐逻辑）。

`avatarHref` 这个 prop（11 号卡加的，头像本身可以单独包一层 `<Link>` 跳转）这次结构调整后可能会跟"整卡点击"产生冲突（头像现在处于整卡的可点击区域内部，如果头像自己又是一个 `<Link>`，会出现可点击区域嵌套可点击区域的问题）——`profile-page.tsx` 现在传的 `avatarHref` 和 `profileHref` 本来就是同一个目标地址（`/users/${currentUserId}`），这次整卡都跳这个地址了，`avatarHref` 这个 prop 已经没有存在的必要，可以整个删掉（prop 定义 + `profile-page.tsx` 的调用都要删），不用保留一个功能重复、还可能引发嵌套问题的 prop。

### 1.2 头像右下角铅笔编辑角标

小圆形角标（参考项目里其它圆形图标按钮的写法，比如 `GroupRow` 的图标容器），叠在头像右下角（`absolute` 定位 + 头像容器 `relative`），白色背景 + 细边框，里面一个 `Pencil` 图标（`lucide-react`，项目里 `profile-page.tsx` 已经在用这个图标，"编辑个人信息"那一行）。点击跳 `/profile/edit`（`Link to="/profile/edit"`，记得 `stopPropagation`，见 1.1）。

### 1.3 名字 + 年龄同一行（年龄做成胶囊），简介独立一行

现在的渲染顺序是：头像/昵称/图标按钮一行 → 简介（`bio`）→ 年龄（`age`，单独一行，`mt-1 text-sm text-text-muted`）。

改成：昵称和年龄放同一行（年龄做成小胶囊——浅灰底色圆角标签，参考项目里 pill 类的写法，比如 `top-bar.tsx`/`activity-card.tsx` 里筛选 tab 的胶囊样式，字号比昵称小一档）→ 简介单独一行，在这一行下面（`bio` 判空渲染逻辑不变，为空整段不渲染）。`age` 的判空渲染逻辑不变（`age !== null && age !== undefined` 时渲染），只是位置和展示形式变了（从独立一行的纯文字，变成跟昵称同一行的胶囊）。

## 2. "我的"页调用方：`src/pages/profile/profile-page.tsx`

- `<ProfileSummary>` 调用去掉 `avatarHref` 这个 prop（原因见 1.1，功能被整卡点击覆盖了，避免嵌套可点击区域）。`profileHref`、`bio`、`age`、`displayName`、`avatarUrl` 这几个 prop 保留不变。
- 其它部分（下面几张 `GroupCard`、退出登录卡片）这次不涉及，不用动。

## 3. 公开主页头部：`src/pages/profile/user-profile-page.tsx`

### 3.1 返回 + 更多操作，从悬浮改成页面顶部单独一行

现在 `FLOATING_ICON_BUTTON_CLASS_NAME`（返回箭头）和 `FloatingMoreMenu`（更多操作）都是 `fixed` 定位悬浮在内容上方（`fixed top-4 left-4` / `fixed right-4 top-4`）。这次改成页面顶部一条普通的页内行（不再 `fixed`），左边返回箭头、右边更多操作按钮，`justify-between` 布局，不挡下面头像——具体做法：

- 去掉 `FLOATING_ICON_BUTTON_CLASS_NAME` 里的 `fixed top-4 z-10` 和 `left-4`，改成放进一个新的顶部容器 `<div className="flex items-center justify-between px-4 pt-3">`（或类似写法，具体 padding 按视觉效果调），返回按钮和 `FloatingMoreMenu`（见 3.2，改名成普通的 more-menu 也行，不强制改名）平级放在这个容器里。
- 返回按钮**不能**塞进 `!isPending && !isError && data` 那个条件分支里——现在的注释写得很清楚："不管加载中/加载失败/用户不存在，都应该能点这个箭头离开这个页面"，这条约束这次不变，返回按钮所在的这一行整体要在最外层无条件渲染，"更多操作"继续维持 `{data && !isOwnProfile && userId ? <MoreMenu .../> : null}` 这个现有的条件（自己主页/数据没加载完不显示），这一行本身允许"只有返回箭头、右边空着"这种状态。
- 原来给悬浮效果专门加的 `shadow-settings-item` 投影可以保留也可以去掉（现在是普通页内元素，不是悬浮在内容上方，投影不是必须的，按视觉效果自行判断，不强制）。
- 下面内容区（`mx-auto max-w-md px-4 pb-20 pt-6 md:pb-6`）原来的 `pt-6` 是给悬浮按钮让出空间用的，现在按钮改成页内元素了，这个 `pt-6` 大概率不再需要（或者需要减小），按实际效果调整，不强制具体数值。

### 3.2 "屏蔽此人/取消屏蔽"从独立按钮挪进"更多操作"下拉菜单

现在 `FloatingMoreMenu` 下拉菜单只有一项"举报用户"（`Link to={`/users/${userId}/report`}`），"屏蔽此人/取消屏蔽"是页面下面单独的一个 `<button>`（`onClick={() => void handleToggleBlock()}`，文案根据 `isBlockActionPending`/`isBlocking` 变化）。

这次把"屏蔽此人/取消屏蔽"也挪进这个下拉菜单，跟"举报用户"变成同一个菜单里的两项。因为这个操作需要 `isBlocking`/`isBlockActionPending`/`handleToggleBlock` 这几个现在定义在 `UserProfilePage` 组件里的状态和函数，`FloatingMoreMenu`（一个独立的子组件）需要新增 props 把这些传进去：

```tsx
interface FloatingMoreMenuProps {
  userId: string;
  isBlocking: boolean | undefined;
  isBlockActionPending: boolean;
  onToggleBlock: () => void;
}
```

菜单里"举报用户"下面（或上面，顺序按视觉习惯定）新增一个 `<button>`（不是 `<Link>`，因为这是一个会触发 mutation 的操作，不是纯导航）：

```tsx
<button
  type="button"
  onClick={() => {
    setOpen(false);
    onToggleBlock();
  }}
  disabled={isBlockActionPending}
  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
>
  {/* 图标可以用现有 lucide-react 里的 Ban/UserX 之类跟"屏蔽"语义相关的，项目
      其它地方（比如 profile-page.tsx 的"已屏蔽"行）用的是 Ban，这里可以直接
      复用同一个图标保持一致 */}
  {isBlockActionPending ? "处理中…" : isBlocking ? "取消屏蔽" : "屏蔽此人"}
</button>
```

`UserProfilePage` 调用 `<FloatingMoreMenu>` 时把 `isBlocking`、`isBlockActionPending`、`onToggleBlock={() => void handleToggleBlock()}` 一起传下去。`blockError` 这条错误提示的展示位置不用变，继续渲染在页面主体里（不用挪进菜单）。

删掉原来页面下方单独的"屏蔽此人"`<button>`（第 405-412 行那个），下面第 4 点会把"发消息"改成独立的满宽按钮。

### 3.3 头像缩小到 60px，年龄挪到昵称同一行（胶囊），简介保持独立一行

现在头像行是 `flex items-center gap-4`，头像 `h-24 w-24`（96px），旁边是 `<div><h1>{displayName}</h1>{age !== null ? <p>{age} 岁</p> : null}</div>`（昵称在上、年龄在下，各占一行），`bio` 在这个 flex 行下面单独一个 `<p>`。

这次：

- 头像改成 `h-15 w-15`（60px，项目 Tailwind 配置里如果没有 `h-15` 这个档位，用 `h-[60px] w-[60px]` 任意值也可以，具体按项目里其它地方处理非标准间距的写法来）。
- 昵称和年龄改成同一行：年龄从下面单独的 `<p>` 改成跟昵称并排的胶囊（视觉上和 1.3 里"我的"页身份卡的年龄胶囊是同一套样式，可以抽一个共用的小组件/复制同样的 class，不用做成完全不同的两套胶囊样式）。
- 简介（`bio`）保持在这一整行（头像+昵称+年龄）下面、独立一行，位置相对关系不变（这一点上次去 Banner 那张任务卡已经是这样了，这次不用改这部分）。

### 3.4 "发消息"改成满宽按钮，屏蔽按钮移除，下面加分割线

现在的按钮行（第 395-414 行）：
```tsx
{!isOwnProfile ? (
  <div className="mt-4 flex items-center gap-3">
    <button ...>发消息</button>
    <button ...>屏蔽此人/取消屏蔽</button>
  </div>
) : null}
```

改成只保留"发消息"一个按钮，宽度撑满容器（`w-full`），"屏蔽此人"已经挪进更多操作菜单（见 3.2），这里删掉：
```tsx
{!isOwnProfile ? (
  <button
    type="button"
    onClick={handleMessage}
    disabled={createConversation.isPending}
    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
  >
    {createConversation.isPending ? "创建会话中…" : "发消息"}
  </button>
) : null}
```
（具体 padding/高度数值按视觉效果微调，不强制跟示例完全一致，核心是宽度撑满、屏蔽按钮不再在这里。）

"发消息"按钮下面、"作品"标题上面，加一条分割线（参考项目里其它地方的分割线写法，比如 `divide-divider`/单独一个 `<div className="border-t border-divider">`，具体用哪个 class 按项目现有约定选，不新造一个分割线 token）。

`isOwnProfile` 为 true（自己看自己的公开主页）时，原来就不渲染这个按钮行，这次也一样不渲染——但分割线是不是也要在这种情况下跳过、直接从头像/简介区域到"作品"标题，还是保留分割线只是少一个按钮，这个细节按视觉效果自行判断，不强制。

## 明确不做的事

- **不改"发消息"按钮本身的逻辑**（`handleMessage`、`createConversation` mutation、错误处理）——这次只改按钮的外观（从并排双按钮改成满宽单按钮）和"屏蔽此人"挪到哪里，不碰这个函数内部的任何行为。
- **不改屏蔽/取消屏蔽的 mutation 逻辑**（`handleToggleBlock`、`useBlockUserMutation`/`useUnblockUserMutation`/`useIsBlockingQuery`）——这次只是把触发它的按钮从页面主体挪进下拉菜单，函数本身、`blockError` 的展示、屏蔽生效的后端行为都不变。
- **不改举报用户的路由/逻辑**（`/users/:userId/report`）——继续是菜单里的一个 `<Link>`，只是现在旁边多了一个屏蔽按钮。
- **不改"作品"标题和帖子网格**（`PostList authorId={userId}`）——这部分上次任务卡已经改完，这次不涉及。
- **不改 `usePublicProfileQuery`/`getPublicProfile`/数据层**——这次都是展示层/交互层的调整，不碰数据获取。
- **不改地区筛选相关的任何文件**——那是另一张任务卡（`feat/region-filter-state-only`）的范围，两张卡之间没有文件交集，不要因为顺手就跨过去改。

## 验证要求

- "我的"页：身份卡整卡可点（点头像、昵称、简介空白处都跳到 `/users/:自己的id`），头像右下角铅笔角标单独跳 `/profile/edit`、点铅笔不会同时触发整卡跳转（用测试或手动验证事件不冒泡）；昵称和年龄同一行（年龄是胶囊），简介独立一行在下面；卡片右侧有箭头提示可点。
- 公开主页（非本人视角）：返回箭头和"更多操作"按钮在页面顶部同一行，正常文档流，不悬浮、不挡头像；"更多操作"菜单打开后有"举报用户"和"屏蔽此人"（或"取消屏蔽"，取决于当前状态）两项，点"屏蔽此人"后菜单关闭、状态正确切换（已经屏蔽的用户再打开菜单应该显示"取消屏蔽"）；页面主体不再有单独的屏蔽按钮；"发消息"是满宽按钮，点击行为跟改动前一致；按钮下面有条分割线再接"作品"标题。
- 公开主页（加载中/加载失败/用户不存在/本人视角）：返回箭头始终可点；本人视角不显示"更多操作"、不显示"发消息"按钮（分割线是否显示按你们视觉判断处理，不强制）。
- `npm run typecheck && npm run test && npm run build` 全部通过——`profile-summary.test.tsx`/`profile-page.test.tsx`/`user-profile-page.test.tsx` 这几个文件里断言旧的图标按钮/`avatarHref`/年龄单独一行/双按钮并排/悬浮定位 class 的测试，按需同步更新成新结构的断言。
