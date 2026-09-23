# 任务卡：分类专属的帖子无图占位（替换掉现在的灰底🖼占位）（编号留空）

> **对应 worktree**：等"求租板块改版"那张卡合并进 `main` 之后再建，建议路径 `C:\Users\32092\Documents\Codex\saminest-v2-post-placeholder`（分支 `feat/post-category-placeholder`），到时候我会给你对应的 `git worktree add` 命令。这张卡跟"求租板块改版"都会改 `post-list.tsx`，顺序做才不会撞出合并冲突。

## 背景（已读代码确认）

`src/features/posts/post-list.tsx` 里，没有封面图的帖子现在统一展示成：

```tsx
<div
  aria-hidden="true"
  data-testid="post-thumbnail-placeholder"
  className="flex aspect-[4/5] w-full items-center justify-center bg-border text-2xl"
>
  🖼
</div>
```

灰底（`bg-border`）+ 一个图片 emoji，所有分类共用同一套，看起来很像"图片加载失败"，容易让用户误以为帖子坏了，而不是"这类帖子本来就不配图"。

## 修法

不用加新字段——帖子数据里已经有 `categoryName`（`"求租"`/`"租房"`/`"二手"`，`PostFeedItem.categoryName`，`row.category?.name_zh ?? "未知分类"`，见 `posts-repository.ts`），按这个字段做分类专属的占位样式：

- 保持现在的 `aspect-[4/5]` 比例不变——19 号卡明确要求两列网格保持等高对齐、不做瀑布流，这条这次不能破。
- 背景从纯灰 `bg-border` 换成浅色品牌色调 `bg-primary-light`（`DESIGN.md` 里已有的 token，浅蓝底），不是继续用中性灰——纯灰底配合下面要换的图标，才能让人一眼看出"这是设计好的占位样式"，而不是"缺了什么东西"。
- 中间不再放 emoji，换成 lucide-react 的线性图标（这个文件已经在用 `MapPin`，风格延续，不用 emoji）+ 图标下面一行分类名文字，按分类映射：
  - `"求租"` → `Search`（放大镜，呼应"找"这个动作）
  - `"租房"` → `Home`
  - `"二手"` → `Tag`
  - 其它/未知分类（理论上不会出现，防御性兜底）→ 用一个通用图标，比如 `ImageOff` 或 `Package`，文案就用 `categoryName` 本身，不用额外判断。
- 图标和文字都用 `text-primary`（不用 `text-text-muted`/纯灰），跟浅蓝底配成一套，视觉上接近现有的 `tag-chip` 配色（`bg-primary-light` + `text-primary`，见 `DESIGN.md` 组件表），复用已有的配色语言，不是另起一套新颜色。图标建议 `size={28}` 左右、文字 `text-xs font-medium`，具体数值按视觉效果微调。

映射函数写在 `post-list.tsx` 文件内（或者你觉得合适的话放进 `utils/format.ts` 或新开一个小工具文件都可以，不强制），按 `categoryName` 字符串精确匹配——这是这次改动刻意选的简化方案：现在分类是固定的三个（`rent`/`wanted`/`used`，见 `categories` 表种子数据），按中文名字符串匹配足够用；如果以后分类名字改了或者新增分类，这个映射会静默退回兜底图标，不会报错，但也不会自动"猜"出合适的图标——这个代价是可以接受的，比引入分类 slug→图标的额外配置表更简单。

**这次改动之后，"求租"这个分类的帖子理论上还会不会走到这个占位组件，取决于"求租板块改版"那张任务卡有没有先落地**——如果那张卡先做完，求租帖子已经整体搬到自己的文字列表 Tab、不再进图片网格，这个占位组件实际上只会给"租房"/"二手"（以及推荐流里这两类没图的帖子）展示；如果这张卡先落地、那张卡还没做，"求租"分类暂时还会在网格里出现、用上这次新加的放大镜占位，等那张卡落地之后这个分支自然不会再触发，不需要互相等待，两张卡谁先做都不影响对方。

## 验收标准

- 没有封面图的帖子卡片，占位样式按分类区分：求租=浅蓝底+放大镜+"求租"文字，租房=浅蓝底+房子图标+"租房"文字，二手=浅蓝底+标签图标+"二手"文字，比例仍然是 4:5，两列网格对齐不受影响。
- 有封面图的帖子卡片渲染逻辑完全不变（这次只改没有图片的分支）。
- `post-list.test.tsx`（如果现有测试里断言了 `post-thumbnail-placeholder` 这个 `data-testid` 或者🖼这个 emoji）需要同步更新断言内容，不能让旧测试断言"还是 emoji"卡住构建。
- `npm run typecheck && npm run test && npm run build` 全部通过；不涉及任何数据库改动，不需要新迁移。
