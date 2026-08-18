import { Send } from "lucide-react";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useCreateCommentMutation } from "../features/comments/use-create-comment-mutation";
import { usePostCommentsQuery } from "../features/comments/use-post-comments-query";
import { usePostDetailQuery } from "../features/posts/use-post-detail-query";
import { useAuthStore } from "../store/auth-store";
import { AppError } from "../utils/app-error";
import { buildCommentTree } from "../utils/build-comment-tree";
import { validateCommentContent } from "../utils/comment-content-validation";
import { CommentItem } from "./comment-item";

export interface CommentSectionProps {
  postId: string;
}

const DEFAULT_ERROR_MESSAGE = "发表评论失败，请稍后重试。";

/**
 * 帖子详情页评论区，接入 post-detail-page.tsx。
 *
 * 标题里的数量特意用 usePostDetailQuery(postId).data.commentCount（跟
 * post-detail-page.tsx 页头查的是同一个 queryKey ["post-detail", postId]，
 * 这里再调一次这个 hook 只是命中缓存，不会多发一次请求），不是本地
 * comments.length 现算——posts.comment_count 由数据库触发器同步（只在
 * INSERT/软删除时 +1/-1），comments.length 会把已经软删除的评论也数
 * 进去，口径对不上。
 *
 * 这一轮不做 Realtime：usePostCommentsQuery 只在挂载时查一次，用户自己
 * 提交/删除评论后由对应 mutation 的 onSuccess invalidate 触发重新拉取。
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
export function CommentSection({ postId }: CommentSectionProps) {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id ?? null;

  const { data: postDetail } = usePostDetailQuery(postId);
  const { data: comments, isPending, isError } = usePostCommentsQuery(postId);
  const createCommentMutation = useCreateCommentMutation();

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
    if (createCommentMutation.isPending || !userId) return;

    setValidationError(null);
    setSubmitError(null);

    const validation = validateCommentContent(content);
    if (!validation.success) {
      setValidationError(validation.error.message);
      return;
    }

    try {
      await createCommentMutation.mutateAsync({
        postId,
        userId,
        parentId: null,
        content: validation.content
      });
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

  const commentCount = postDetail?.commentCount ?? 0;
  const tree = comments ? buildCommentTree(comments) : [];

  return (
    <section aria-label="评论区" className="mt-4">
      <h2 className="mb-3 text-base font-semibold text-text">评论 ({commentCount})</h2>

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
          <div className="flex items-end gap-2 rounded-full border border-border bg-bg px-4 py-2 focus-within:border-primary">
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
              aria-label={createCommentMutation.isPending ? "发送中…" : "发表评论"}
              disabled={createCommentMutation.isPending}
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
            <CommentItem key={node.id} node={node} depth={0} currentUserId={userId} />
          ))
        : null}
    </section>
  );
}
