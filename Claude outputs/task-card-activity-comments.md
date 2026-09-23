# 任务卡：找搭子详情页留言区

## 对应 worktree
路径：`../saminest-v2-activity-comments`
分支：`feat/activity-comments`

## 背景
BARRY 要求给"找搭子"活动详情页（`activity-detail-page.tsx`）加一个留言区，参照帖子详情页已有的评论功能（`comment-section.tsx`，接在 `post-detail-page.tsx` 下面）。

数据库这边已经在生产库做好了配套迁移（`add_activity_comments_support`），这个 worktree 从最新 main 拉出来的时候应该已经带着更新过的 `src/types/database.generated.ts`：
- `comments` 表新增 `activity_id`（uuid，可空，外键指到 `activities.id`），`post_id` 同步改成可空——跟 `favorites` 表 `post_id`/`activity_id` 二选一是同一个模式（`comments_target_check` 约束：两者恰好一个非空）。回复层级（`parent_id`）、软删除（`deleted_at`）这套既有机制原样复用，不是另建一张表。
- `activities` 表新增 `comment_count`（bigint，默认 0），由数据库触发器（泛化过的 `sync_post_comment_count()`）在 `comments` 表 INSERT/软删除时自动维护，跟 `posts.comment_count` 是同一个模式，前端不需要手动加减。
- RLS 三条策略（`comments_select_of_approved_or_own_posts`/`comments_insert_own`/`comments_delete_own`）都已经泛化成同时认 `post_id` 和 `activity_id`：活动这边的可见性条件跟 `activities_select_public`（未删除且不是已取消）保持一致，另外活动发起人本人也总能看到/在自己活动下发言。这些策略已经在数据库层面生效，前端只要按下面的写法传参就行，不用关心 RLS 细节。

## 具体改法

### 1. `src/repositories/comments-repository.ts`
现在的 `Comment` 接口/`listPostComments(postId)`/`createComment({ postId, ... })` 都是硬编码只认 `postId`。改成能表达"这条评论挂在帖子还是活动下面"的目标类型：

```ts
export interface Comment {
  id: string;
  /** 二选一，跟 comments 表 comments_target_check 约束一致：帖子评论
   *  postId 非空、activityId 为 null；活动留言反过来。 */
  postId: string | null;
  activityId: string | null;
  userId: string;
  parentId: string | null;
  content: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  isDeleted: boolean;
}
```
`listPostComments(postId)` 泛化成 `listComments(target: { postId: string } | { activityId: string })`，内部按 target 里有哪个字段决定 `.eq("post_id", ...)` 还是 `.eq("activity_id", ...)`；`CommentRow` 的 select 语句加上 `activity_id` 这一列，映射逻辑照抄 `post_id` 那一行的写法。

`createComment` 的 `CreateCommentInput` 同样泛化（`postId`/`activityId` 二选一），插入 payload 对应传 `post_id`/`activity_id`（另一个留 `null` 或不传，看 Supabase insert 类型要求）。

`softDeleteComment` 不用改——它只按 `commentId`/`userId` 操作，跟目标类型无关。

### 2. `src/features/comments/use-post-comments-query.ts` 和 `use-create-comment-mutation.ts`
参照它们现在的写法（`useQuery`/`useMutation` 包一层 `listPostComments`/`createComment`），泛化成接受同一种 `target` 参数，或者简单起见新增一对 `use-activity-comments-query.ts`/`use-create-activity-comment-mutation.ts`（如果泛化成通用参数会让调用方 `post-detail-page.tsx`/`comment-section.tsx` 的改动面更大，Codex 自己判断哪种改法更干净、改动更小，两种都可以，不是硬性要求）。

**关键约束**：不管选哪种做法，`post-detail-page.tsx` 现有的帖子评论功能必须保持完全不变的行为（同样的 queryKey、同样的 invalidate 时机），不能因为这次泛化引入回归。

### 3. `src/components/comment-section.tsx`
`CommentSectionProps` 从 `{ postId: string }` 泛化成 `{ postId: string } | { activityId: string }`（或者拆成两个更明确的 prop，比如 `target: { type: "post"; postId: string } | { type: "activity"; activityId: string }`，Codex 自己判断哪种类型定义更清楚）。组件内部原来直接用 `postId` 的地方（`usePostCommentsQuery(postId)`、`useCreateCommentMutation` 传参、`usePostDetailQuery(postId).data.commentCount` 取评论数标题）都要相应改成按 target 类型分支。

**留言数标题**（`<h2>留言 ({commentCount})</h2>`）这一块要注意：帖子场景现在是读 `usePostDetailQuery(postId).data.commentCount`（命中缓存，不多发请求，见组件里现有注释）；活动场景要看一下第 5 点加完 `comment_count` 之后，`activity-detail-page.tsx` 本来就在查的活动详情数据里能不能直接拿到，照搬同一个"命中缓存不多发请求"的模式，不要为了取这一个数字单独再发一次请求。

### 4. `src/pages/activities/activity-detail-page.tsx`
在"已加入"列表和"联系发起人"/参与按钮那组之后（大约在现有文件第 437-439 行 `</div>` 关闭那组按钮之后，`</div></main>` 之前），接入 `<CommentSection activityId={data.id} />`（或者对应你在第 3 点选定的 prop 形式），位置参照 `post-detail-page.tsx` 里 `CommentSection` 是怎么接在页面最下面的。

### 5. `src/repositories/activities-repository.ts` 和 `src/features/activities/use-activity-detail-query.ts`
确认 `getActivityDetail()`（或者它调用的 select 语句）的返回类型/select 列表要带上新的 `comment_count`，跟 `posts-repository.ts` 的 `getPostDetail()` 已经在选 `comment_count` 是同一个模式。对应的接口（Codex 先读代码确认现在叫什么，比如 `ActivityDetail`）加一个 `commentCount: number` 字段。

## 明确不做的事
- 不做分页、不做 Realtime——跟帖子评论现在的实现范围一致（`comment-section.tsx` 顶部注释里已经写明这轮不做）。
- 不改帖子评论（`post-detail-page.tsx`/现有的 `comments-repository.ts` 行为）本身的任何用户可见行为——只做类型/参数层面的泛化，验证要求里会重点核对这一点。
- 不给活动留言加"长按弹出举报入口"这类帖子评论已有的额外交互（`comment-item.tsx` 里那部分）——除非 `comment-item.tsx` 本身就是通用组件、活动留言复用它时这些交互自然就带上了，那就不用特意去掉；但也不需要专门为活动场景新增什么。
- 不改活动的 RLS/触发器/迁移——数据库这边已经做完了，这次任务卡只碰前端文件。

## 验证要求
- `npm run typecheck && npm run test && npm run build`，贴完整输出。
- 重点核对：`post-detail-page.tsx` 现有的评论相关测试要全部保持通过、不能因为泛化引入行为变化。
- 新增测试覆盖：活动详情页留言区的渲染、发表留言、留言数标题、未登录态的"登录后可以发表"提示——参照 `comment-section.tsx`/`post-detail-page.tsx` 现有测试的覆盖方式照抄一套改成活动场景。
- 麻烦真跑一遍：找一个活动详情页，登录状态下发一条留言，确认留言数、留言列表、软删除自己的留言都正常；再用另一个账号确认能看到公开活动下的留言（不需要是参与者也能看，只要活动本身是"未取消、未删除"的公开活动）。测试账号用完按老规矩清理。
- 不需要额外的 Supabase 迁移——`comments.activity_id`/`activities.comment_count`/相关 RLS 已经在生产库生效了。
