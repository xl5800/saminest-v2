import { type FormEvent, useState } from "react";
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
          <label className="block text-sm font-medium text-text">
            发表评论
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="写下你的评论…"
              className="mt-1 min-h-[80px] w-full rounded border border-border px-3 py-2 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            disabled={createCommentMutation.isPending}
            className="mt-2 rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createCommentMutation.isPending ? "发送中…" : "发表"}
          </button>
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
