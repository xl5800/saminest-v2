import { type FormEvent, useState } from "react";

import { useCreateCommentMutation } from "../features/comments/use-create-comment-mutation";
import { useDeleteCommentMutation } from "../features/comments/use-delete-comment-mutation";
import { useCreateReportMutation } from "../features/reports/use-create-report-mutation";
import { REPORT_REASON_OPTIONS } from "../repositories/reports-repository";
import { AppError } from "../utils/app-error";
import type { CommentNode } from "../utils/build-comment-tree";
import { validateCommentContent } from "../utils/comment-content-validation";
import { formatListingDate } from "../utils/format";

export interface CommentItemProps {
  node: CommentNode;
  depth: number;
  currentUserId: string | null;
}

// 视觉缩进用 Math.min(depth, MAX_INDENT_DEPTH) 封顶——数据结构本身仍然
// 支持无限深度回复，只是超过 4 层之后不再继续往右缩进，避免移动端窄屏下
// 缩进吃掉所有横向空间，把内容挤成一条竖线。用内联样式而不是 Tailwind
// 的 pl-{n} 类名，因为这个值是运行时算出来的，Tailwind 只认字面量类名，
// 编译不出对应的 CSS（见 CommentSection/CommentItem 的任务说明）。
const MAX_INDENT_DEPTH = 4;
const INDENT_PX_PER_LEVEL = 16;

const REPORT_REASON_REQUIRED_MESSAGE = "请选择举报原因。";
const REPORT_DEFAULT_ERROR_MESSAGE = "举报提交失败，请稍后重试。";
const DELETE_ERROR_MESSAGE = "删除失败，请稍后重试。";
const REPLY_DEFAULT_ERROR_MESSAGE = "回复发表失败，请稍后重试。";

type ActiveAction = "reply" | "delete" | "report" | null;

/**
 * 递归渲染一条评论 + 它的全部回复。三个行内操作（回复输入框/删除确认/
 * 举报面板）互斥，用一个 activeAction 本地 state 控制，同一时刻最多展开
 * 一个——照抄 all-posts-page.tsx"点删除→行内展开确认区域→确认/取消"的
 * 交互模式，不用居中弹窗（评论条数可能很多，每条都弹一个居中遮罩太重）。
 *
 * 缩进/递归结构：这个组件返回一个 Fragment（当前节点内容 + 它的
 * children 列表作为同级兄弟节点渲染，不是把 children 嵌套进当前节点的
 * DOM 容器内部）——如果嵌套渲染，子节点的 paddingLeft 会在父节点已经
 * 缩进过的基础上再叠加一次，越往下层级缩进量会指数级失控；用 Fragment
 * 让所有层级的评论在真实 DOM 里是一串平级的 div，每个 div 只用自己的
 * 绝对 depth 算一次 paddingLeft，视觉上仍然呈现出树状缩进效果，但不会
 * 叠加。
 *
 * 未登录（currentUserId === null）时不显示"回复/删除/举报"这三个操作，
 * 只能看不能操作——跟 CommentSection 顶部"未登录不显示输入框"是同一个
 * 原则。
 *
 * 已删除评论的展示分两种情况：没有任何回复的直接 return null，整条从
 * 列表里消失；下面还挂着别人回复的不能直接不渲染（会导致那些回复变成
 * 悬空孤儿内容，看不出在回复谁），改成渲染一个极简占位（不显示昵称/
 * 时间/操作按钮，字号更小、视觉权重更低）。这个判断只看当前节点自己的
 * isDeleted + children.length，不递归清理"整条链都是空的已删除节点"这种
 * 边界情况——概率很低，保持实现简单。
 */
export function CommentItem({ node, depth, currentUserId }: CommentItemProps) {
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  const [replyContent, setReplyContent] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const createCommentMutation = useCreateCommentMutation();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteCommentMutation = useDeleteCommentMutation();

  const [reportReasonCode, setReportReasonCode] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const createReportMutation = useCreateReportMutation();

  const canAct = currentUserId !== null;
  const isOwnComment = currentUserId !== null && node.userId === currentUserId;

  function toggleAction(action: Exclude<ActiveAction, null>): void {
    setActiveAction((current) => (current === action ? null : action));
    // 切换到另一个互斥操作时，清掉上一个操作留下的错误提示——不清的话
    // 用户点开"回复"看到的可能是刚才"删除"失败时留下的错误文字，牛头
    // 不对马嘴。
    setReplyError(null);
    setDeleteError(null);
    setReportError(null);
  }

  async function handleReplySubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (createCommentMutation.isPending || !currentUserId) return;

    setReplyError(null);
    const validation = validateCommentContent(replyContent);
    if (!validation.success) {
      setReplyError(validation.error.message);
      return;
    }

    try {
      await createCommentMutation.mutateAsync({
        postId: node.postId,
        userId: currentUserId,
        parentId: node.id,
        content: validation.content
      });
      setReplyContent("");
      setActiveAction(null);
    } catch (error) {
      // COMMENT_CREATE_FORBIDDEN 的 AppError.message 本身就是一条已经写好
      // 的通用提示（见 comments-repository.ts），可以直接展示；其它失败
      // （包括 COMMENT_CREATE_FAILED，它的 message 是原始的 Supabase 报错）
      // 一律回退到本地这条通用文案，不把底层错误细节露给用户。
      setReplyError(
        error instanceof AppError && error.code === "COMMENT_CREATE_FORBIDDEN"
          ? error.message
          : REPLY_DEFAULT_ERROR_MESSAGE
      );
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (deleteCommentMutation.isPending || !currentUserId) return;

    setDeleteError(null);
    try {
      await deleteCommentMutation.mutateAsync({
        commentId: node.id,
        userId: currentUserId,
        postId: node.postId
      });
      setActiveAction(null);
    } catch {
      setDeleteError(DELETE_ERROR_MESSAGE);
    }
  }

  async function handleReportSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (createReportMutation.isPending || !currentUserId) return;

    setReportError(null);
    if (!reportReasonCode) {
      setReportError(REPORT_REASON_REQUIRED_MESSAGE);
      return;
    }

    const trimmedDescription = reportDescription.trim();

    try {
      await createReportMutation.mutateAsync({
        reporterId: currentUserId,
        targetType: "comment",
        targetId: node.id,
        reasonCode: reportReasonCode,
        description: trimmedDescription ? trimmedDescription : null
      });
      setReportSubmitted(true);
    } catch (error) {
      // 跟 report-post-page.tsx 同一个模式：REPORT_DUPLICATE/ACCOUNT_RESTRICTED
      // 是明确、可操作的失败原因，直接展示；其它一律回退到通用文案。
      if (
        error instanceof AppError &&
        (error.code === "REPORT_DUPLICATE" || error.code === "ACCOUNT_RESTRICTED")
      ) {
        setReportError(error.message);
      } else {
        setReportError(REPORT_DEFAULT_ERROR_MESSAGE);
      }
    }
  }

  const indentPx = Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX_PER_LEVEL;

  // 已删除且没有任何回复——整条从列表里消失（包括外层容器都不渲染），
  // 就像没发过一样；已删除但下面还挂着别人的回复，不能直接不渲染，否则
  // 那些回复会变成"看不出在回复谁"的悬空孤儿内容，仍要渲染一个占位（见
  // 下面 isDeleted 分支），只是视觉权重比之前那版明显降低。
  if (node.isDeleted && node.children.length === 0) {
    return null;
  }

  return (
    <>
      <div style={{ paddingLeft: indentPx }} className="mt-3">
        {node.isDeleted ? (
          <p className="text-xs text-text-muted">该评论已删除</p>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="break-words text-sm font-medium text-text">
                {node.authorDisplayName}
              </span>
              <span className="shrink-0 text-xs text-text-muted">
                {formatListingDate(node.createdAt)}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text">
              {node.content}
            </p>

            {canAct ? (
              <div className="mt-1 flex gap-3 text-xs text-text-muted">
                <button
                  type="button"
                  onClick={() => toggleAction("reply")}
                  className="hover:text-primary"
                >
                  回复
                </button>
                {isOwnComment ? (
                  <button
                    type="button"
                    onClick={() => toggleAction("delete")}
                    className="hover:text-danger"
                  >
                    删除
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleAction("report")}
                  className="hover:text-danger"
                >
                  举报
                </button>
              </div>
            ) : null}

            {activeAction === "reply" ? (
              <form onSubmit={handleReplySubmit} className="mt-2">
                {replyError ? (
                  <p
                    role="alert"
                    className="mb-2 rounded border border-danger bg-danger/10 px-2 py-1 text-xs text-danger"
                  >
                    {replyError}
                  </p>
                ) : null}
                <label className="block text-xs font-medium text-text">
                  回复 {node.authorDisplayName}
                  <textarea
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                    className="mt-1 min-h-[60px] w-full rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="submit"
                    disabled={createCommentMutation.isPending}
                    className="rounded bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createCommentMutation.isPending ? "发送中…" : "发送"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveAction(null)}
                    className="rounded border border-border px-3 py-1 text-xs text-text hover:bg-bg"
                  >
                    取消
                  </button>
                </div>
              </form>
            ) : null}

            {activeAction === "delete" ? (
              <div className="mt-2 rounded border border-border bg-bg p-2">
                {deleteError ? (
                  <p
                    role="alert"
                    className="mb-2 rounded border border-danger bg-danger/10 px-2 py-1 text-xs text-danger"
                  >
                    {deleteError}
                  </p>
                ) : null}
                <p className="text-xs text-text">确定删除这条评论吗？</p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    disabled={deleteCommentMutation.isPending}
                    onClick={handleConfirmDelete}
                    className="rounded border border-danger bg-danger px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    确认删除
                  </button>
                  <button
                    type="button"
                    disabled={deleteCommentMutation.isPending}
                    onClick={() => setActiveAction(null)}
                    className="rounded border border-border px-3 py-1 text-xs text-text hover:bg-bg"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : null}

            {activeAction === "report" ? (
              reportSubmitted ? (
                <p role="status" className="mt-2 text-xs text-success">
                  举报已提交
                </p>
              ) : (
                <form
                  onSubmit={handleReportSubmit}
                  className="mt-2 rounded border border-border bg-bg p-2"
                >
                  {reportError ? (
                    <p
                      role="alert"
                      className="mb-2 rounded border border-danger bg-danger/10 px-2 py-1 text-xs text-danger"
                    >
                      {reportError}
                    </p>
                  ) : null}
                  <fieldset>
                    <legend className="mb-1 text-xs font-medium text-text">举报原因</legend>
                    {REPORT_REASON_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className="mb-1 flex items-center gap-2 text-xs text-text"
                      >
                        <input
                          type="radio"
                          name={`comment-report-reason-${node.id}`}
                          value={option.value}
                          checked={reportReasonCode === option.value}
                          onChange={() => setReportReasonCode(option.value)}
                          className="accent-primary"
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>
                  <label className="mt-1 block text-xs font-medium text-text">
                    补充说明（可选）
                    <textarea
                      value={reportDescription}
                      onChange={(event) => setReportDescription(event.target.value)}
                      className="mt-1 w-full rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="submit"
                      disabled={createReportMutation.isPending}
                      className="rounded border border-danger bg-danger px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {createReportMutation.isPending ? "提交中…" : "提交举报"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAction(null)}
                      className="rounded border border-border px-3 py-1 text-xs text-text hover:bg-bg"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )
            ) : null}
          </div>
        )}
      </div>

      {node.children.map((child) => (
        <CommentItem key={child.id} node={child} depth={depth + 1} currentUserId={currentUserId} />
      ))}
    </>
  );
}
