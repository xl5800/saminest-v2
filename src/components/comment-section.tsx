import { Send } from "lucide-react";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useActivityDetailQuery } from "../features/activities/use-activity-detail-query";
import { useActivityCommentsQuery } from "../features/comments/use-activity-comments-query";
import { useCreateCommentMutation } from "../features/comments/use-create-comment-mutation";
import { usePostCommentsQuery } from "../features/comments/use-post-comments-query";
import { usePostDetailQuery } from "../features/posts/use-post-detail-query";
import type { Comment } from "../repositories/comments-repository";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";
import { buildCommentTree } from "../utils/build-comment-tree";
import { validateCommentContent } from "../utils/comment-content-validation";
import { CommentItem } from "./comment-item";

/**
 * 找搭子留言区任务卡：帖子评论区/活动留言区二选一，跟
 * comments-repository.ts 的 CommentTarget 是同一个两成员联合类型写法（不
 * 加 `?: never` 排他标记，理由见那边的注释——那种写法在下面
 * `"postId" in props` 这类窄化点会让 TypeScript 推断不准）。
 */
export type CommentSectionProps = { postId: string } | { activityId: string };

const DEFAULT_ERROR_MESSAGE = "发表评论失败，请稍后重试。";

/**
 * 帖子详情页评论区 / 活动详情页留言区，接入 post-detail-page.tsx /
 * activity-detail-page.tsx。
 *
 * 找搭子留言区任务卡：这个组件泛化成能同时服务帖子评论和活动留言，但
 * 不是简单地给内部逻辑加一堆 if/else——真正会变的只有"从哪个 query hook
 * 读评论数量/列表"和"提交时调 mutation 传 postId 还是 activityId"这两处，
 * 其余（输入框自动撑高、校验、错误文案、树形渲染）对两种场景完全一样。
 * 拆成三层：
 * 1. `CommentSection`（这个文件唯一导出的公共组件）：纯粹按 props 里有
 *    postId 还是 activityId，分发到下面两个包装组件之一，不含任何自己的
 *    hook 调用——两个包装组件各自的 hook 调用顺序必须稳定，不能在同一个
 *    组件里按 target 类型条件调用 usePostCommentsQuery/
 *    useActivityCommentsQuery 这两个不同的 hook。
 * 2. `PostCommentSection`/`ActivityCommentSection`：各自只调用自己那一路
 *    的 query/mutation hook，把结果整理成 `CommentSectionBody` 需要的
 *    形状。`PostCommentSection` 的实现是这次改动前 `CommentSection`
 *    本体的逐字迁移（同样的 hook、同样的 queryKey、同样的 onSubmit
 *    逻辑），保证帖子详情页的行为/测试完全不受这次泛化影响。
 * 3. `CommentSectionBody`：真正的 UI（标题+数量、输入框、评论树），不
 *    关心自己是帖子还是活动场景，只认"数量、列表、加载/错误状态、
 *    提交回调"这几个跟场景无关的 props。
 *
 * 标题里的数量：帖子场景读 usePostDetailQuery(postId).data.commentCount
 * （命中缓存，不多发请求，见 PostCommentSection 里的说明）；活动场景对称
 * 地读 useActivityDetailQuery(activityId).data.commentCount——两个页面都
 * 已经在自己的详情查询里选了 comment_count（见 posts-repository.ts /
 * activities-repository.ts），这里再调一次同一个 hook、同一个 queryKey，
 * 只是命中 TanStack Query 缓存，不会因为留言区多发一次请求。
 *
 * 这一轮不做 Realtime：评论/留言列表只在挂载时查一次，用户自己提交/删除
 * 后由对应 mutation 的 onSuccess invalidate 触发重新拉取。
 *
 * 输入框改成圆角胶囊状的单行输入条：去掉了单独的"发表评论"文字标签，
 * 直接靠 placeholder 起提示作用；发送按钮变成输入条右侧内嵌的图标按钮
 * （lucide-react 的 Send，这个仓库已经在 bottom-nav.tsx 里引入这个依赖，
 * 不算新增图标库）。
 *
 * 自动撑高用 JS 量 scrollHeight（handleContentChange 里先把
 * style.height 设成 "auto" 再设成 scrollHeight，这是让浏览器先按新内容
 * 重新计算自然高度、再读出来的标准写法，不这样先重置会拿到"撑高之前"的
 * 旧 scrollHeight，只涨不会缩），不是 CSS `field-sizing: content`——
 * 后者 Safari 直到 26.2（2026 年才发布）才支持，这个 App 最低支持
 * iOS 15，用 field-sizing 对几乎所有真实用户都不会生效。`max-h-32` +
 * `overflow-y-auto` 挂在 textarea 自己身上：到达封顶高度后
 * scrollHeight 会大于这个上限，浏览器原生按 max-height 截断、超出部分
 * 交给 overflow-y-auto 内部滚动，不需要额外判断。提交成功清空内容后
 * （handleSubmit 的 setContent("") 那一步）额外把 style.height 重设回
 * "auto"——不重设的话文本框会保持提交前那个撑高的像素高度，看起来像
 * 一个诡异的空白大框，直到用户下次输入触发 handleContentChange 才会
 * 缩回去。
 */
export function CommentSection(props: CommentSectionProps) {
  if ("postId" in props) {
    return <PostCommentSection postId={props.postId} />;
  }
  return <ActivityCommentSection activityId={props.activityId} />;
}

/**
 * 帖子详情页评论区——这次泛化前 CommentSection 本体的逐字迁移，
 * usePostDetailQuery/usePostCommentsQuery/useCreateCommentMutation 三个
 * hook 的调用方式、queryKey 都没有变，帖子详情页的行为不受影响。
 */
function PostCommentSection({ postId }: { postId: string }) {
  const { data: postDetail } = usePostDetailQuery(postId);
  const { data: comments, isPending, isError } = usePostCommentsQuery(postId);
  const createCommentMutation = useCreateCommentMutation();

  return (
    <CommentSectionBody
      commentCount={postDetail?.commentCount ?? 0}
      comments={comments}
      isPending={isPending}
      isError={isError}
      isSubmitting={createCommentMutation.isPending}
      // 评论区样式对齐小红书任务卡：帖子作者 id 命中的是这个页面已经在查
      // 的同一个 usePostDetailQuery 缓存，不是新发一次请求；详情还没加载
      // 出来时是 undefined，归一化成 null，交给 CommentItem 的 ownerId
      // 判断（ownerId 为 null 时不判定任何人是作者）。
      ownerId={postDetail?.authorId ?? null}
      onSubmit={(content, userId) =>
        createCommentMutation.mutateAsync({ postId, userId, parentId: null, content })
      }
    />
  );
}

/**
 * 活动详情页留言区——跟 PostCommentSection 对称，只是换成活动那一路的
 * query/mutation 调用。useActivityDetailQuery(activityId) 命中的是活动
 * 详情页自己已经在查的同一个 queryKey ["activity-detail", activityId]，
 * 不会多发一次请求，见组件顶部注释。
 */
function ActivityCommentSection({ activityId }: { activityId: string }) {
  const { data: activityDetail } = useActivityDetailQuery(activityId);
  const { data: comments, isPending, isError } = useActivityCommentsQuery(activityId);
  const createCommentMutation = useCreateCommentMutation();

  return (
    <CommentSectionBody
      commentCount={activityDetail?.commentCount ?? 0}
      comments={comments}
      isPending={isPending}
      isError={isError}
      isSubmitting={createCommentMutation.isPending}
      // 评论区样式对齐小红书任务卡：跟 PostCommentSection 对称，活动发起人
      // id 命中的也是已经在查的 useActivityDetailQuery 缓存。
      ownerId={activityDetail?.organizerId ?? null}
      onSubmit={(content, userId) =>
        createCommentMutation.mutateAsync({ activityId, userId, parentId: null, content })
      }
    />
  );
}

interface CommentSectionBodyProps {
  commentCount: number;
  comments: Comment[] | undefined;
  isPending: boolean;
  isError: boolean;
  isSubmitting: boolean;
  /** 评论区样式对齐小红书任务卡新增：帖子作者 id / 活动发起人 id，原样
   *  透传给每个顶层 CommentItem（CommentItem 自己再递归传给 children），
   *  见 comment-item.tsx 里 ownerId 的注释。 */
  ownerId: string | null;
  onSubmit: (content: string, userId: string) => Promise<unknown>;
}

/**
 * 帖子/活动共用的留言区 UI——标题+数量、输入框（未登录展示登录引导链接）、
 * 加载/错误/空态、评论树。不关心自己是帖子还是活动场景，只认上面这几个
 * 场景无关的 props；`onSubmit` 由调用方（PostCommentSection/
 * ActivityCommentSection）决定具体调哪个 mutation、传 postId 还是
 * activityId，这个组件只负责校验内容、调用 onSubmit、展示错误。
 */
function CommentSectionBody({
  commentCount,
  comments,
  isPending,
  isError,
  isSubmitting,
  ownerId,
  onSubmit
}: CommentSectionBodyProps) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id ?? null;

  const [content, setContent] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function handleContentChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setContent(event.target.value);
    // 先重置成 "auto" 再读 scrollHeight：不重置的话浏览器还按撑高之前的
    // 高度算 scrollHeight，只会越撑越高，删字缩不回去。
    event.target.style.height = "auto";
    event.target.style.height = `${event.target.scrollHeight}px`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting || !userId) return;

    setValidationError(null);
    setSubmitError(null);

    const validation = validateCommentContent(content);
    if (!validation.success) {
      setValidationError(validation.error.message);
      return;
    }

    try {
      await onSubmit(validation.content, userId);
      setContent("");
      // 清空内容后把撑高的像素高度也重设回 auto，否则文本框会保持提交前
      // 那个高度，看起来像一个诡异的空白大框。
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      setSubmitError(
        error instanceof AppError && error.code === "COMMENT_CREATE_FORBIDDEN"
          ? error.message
          : DEFAULT_ERROR_MESSAGE
      );
    }
  }

  const tree = comments ? buildCommentTree(comments) : [];

  return (
    <section aria-label="留言区" className="mt-4">
      {/* 23 号卡：标题从"评论"改成"留言"——只改这个可见标题（连同它的
          aria-label），下面输入框 placeholder/按钮文案/空态文案里的
          "评论"字样不在这次改动范围内，见完工报告。 */}
      <h2 className="mb-3 text-base font-semibold text-text">留言 ({commentCount})</h2>

      {userId ? (
        <form onSubmit={handleSubmit} className="mb-4">
          {validationError ? (
            <p
              role="alert"
              className="mb-2 rounded border border-danger bg-danger/10 px-2 py-1 text-xs text-danger"
            >
              {validationError}
            </p>
          ) : null}
          {submitError ? (
            <p
              role="alert"
              className="mb-2 rounded border border-danger bg-danger/10 px-2 py-1 text-xs text-danger"
            >
              {submitError}
            </p>
          ) : null}
          {/* 全 App 视觉 Token 体系（第二批）：focus 态从
              focus-within:border-primary（描边变蓝）换成
              focus-within:ring-4 focus-within:ring-primary-light（柔和
              光晕），跟其它表单输入统一，不用加粗/变色边框这种方式。 */}
          <div className="flex items-end gap-2 rounded-full border border-border bg-bg px-4 py-2 focus-within:ring-4 focus-within:ring-primary-light">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              placeholder="写下你的评论…"
              rows={1}
              className="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-base text-text placeholder:text-text-muted focus:outline-none"
            />
            <button
              type="submit"
              aria-label={isSubmitting ? "发送中…" : "发表评论"}
              disabled={isSubmitting}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : (
        <p className="mb-4 text-sm text-text-muted">
          <Link to="/login" className="text-primary hover:underline">
            登录
          </Link>
          后可以发表评论
        </p>
      )}

      {isPending ? (
        <p role="status" className="text-sm text-text-muted">
          加载中…
        </p>
      ) : null}
      {isError ? (
        <p role="alert" className="text-sm text-danger">
          评论加载失败，请稍后重试。
        </p>
      ) : null}
      {!isPending && !isError && tree.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">
          暂无评论，来发表第一条评论吧。
        </p>
      ) : null}

      {!isPending && !isError
        ? tree.map((node) => (
            <CommentItem
              key={node.id}
              node={node}
              depth={0}
              currentUserId={userId}
              ownerId={ownerId}
            />
          ))
        : null}
    </section>
  );
}
