import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState
} from "react";

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

// 33 号卡（留言区头像展示 + 长按弹出举报）：按住多久算一次长按——参考
// 移动端系统手势（iOS/Android 长按普遍在 400～600ms 区间）取的中间值，
// 不是照抄某个具体产品的精确数值。
const LONG_PRESS_MS = 500;
// 按下之后指针/手指移动超过这个像素数就取消这次长按，当成一次滚动/拖动
// 意图，不弹出举报入口——跟 conversation-swipe-row.tsx 的
// DRAG_CLICK_THRESHOLD_PX 是同一个"区分按住不动 vs 移动手势"的道理，取值
// 也保持一致。
const LONG_PRESS_MOVE_CANCEL_PX = 8;

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
 *
 * 33 号卡（留言区头像展示 + 长按弹出举报，仿小红书）：
 * - 头像：作者昵称/时间那一行左边加一个圆形头像（没有头像时首字母兜底
 *   圆圈，照抄 post-list.tsx `variant="wanted"` 卡片/person-card.tsx 已经
 *   用过的 `bg-primary/10 text-primary` 样式，不发明新的兜底视觉）。
 *   顶层评论用 32px（h-8 w-8），回复用 24px（h-6 w-6）——回复本身已经靠
 *   paddingLeft 缩进表达了"层级更深"，头像跟着缩小一档，视觉上更协调，
 *   也避免深层回复（缩进 + 头像 + 昵称 + 时间挤在一行）在窄屏上显得拥挤；
 *   这是这次改动里没有强制要求、我自己做的取舍，见完工报告。
 * - "举报"从常驻文字按钮改成长按（桌面用"按住鼠标不放"模拟）弹出：按住
 *   评论头像+昵称+时间+正文这一整块内容区域（不含下面回复/删除按钮那一
 *   行，否则会跟点击那两个按钮的手势冲突）超过 LONG_PRESS_MS 弹出一个
 *   居中的小浮层，只有一个"举报"按钮，点了之后原样触发
 *   `setActiveAction("report")`——举报表单本身（原因单选/补充说明/提交）
 *   一个字都没有改，只是换了个入口触发方式。
 * - 长按手势用 mousedown/mousemove/mouseup（桌面）+ touchstart/touchmove/
 *   touchend/touchcancel（触屏）两组原生事件实现，不是更"现代"的统一
 *   Pointer Events API——跟 conversation-swipe-row.tsx 左滑手势是同一个
 *   理由：这个仓库的 jsdom 测试环境不支持 window.PointerEvent
 *   （fireEvent.pointerDown 在这里拿到的 clientX/clientY 全部是
 *   undefined），只写 Pointer Events 会完全没法写自动化测试；mouse 系列 +
 *   touch 系列事件分别覆盖桌面和触屏，核心的开始/移动取消/结束逻辑
 *   （beginLongPress/updateLongPress/endLongPress）是共享的，不重复。
 *   鼠标场景下 mousemove/mouseup 挂在 window 上而不是内容区域自己身上，
 *   理由也跟 conversation-swipe-row.tsx 一样：按住之后指针很容易移出这块
 *   不大的内容区域，只挂元素自己会导致移出范围后收不到后续事件。
 * - 长按弹出的浮层选了"居中小 sheet"（照抄 my-posts-page.tsx 删除确认弹窗
 *   `fixed inset-0 flex items-center justify-center bg-black/40` +
 *   `w-full max-w-xs rounded-2xl bg-white p-5 shadow-card` 那个模式），
 *   不是"贴着长按位置定位的气泡菜单"——原因：气泡菜单需要拿长按发生时的
 *   clientX/clientY 算浮层位置、还要处理"贴着屏幕边缘时要不要翻转方向"
 *   这类视口边界问题，居中 sheet 直接复用现成的、已经在这个仓库跑通过的
 *   弹层模式，不需要任何定位计算，实现更简单、更不容易出视觉 bug，长按
 *   之后弹层出现在屏幕中央（而不是手指/鼠标正下方）这点视觉差异对"只有
 *   一个按钮"的极简菜单来说影响很小。点击浮层背景或"取消"按钮关闭，不做
 *   Esc 键关闭（跟 my-posts-page.tsx 的删除确认弹窗一致，PublishActionSheet
 *   那种"选一项就导航离开当前页面"的场景才需要 Esc 快捷退出，这里不是）。
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

  // 33 号卡：长按弹出的"举报"入口浮层是否展开——跟 activeAction 是两个
  // 独立的 state：activeAction 控制"举报表单本身有没有展开"，这个只控制
  // "长按弹出的那个只有一个按钮的小浮层有没有展开"，浮层里点"举报"之后
  // 才会关掉浮层、把 activeAction 设成 "report" 真正展开举报表单。
  const [showLongPressReportPrompt, setShowLongPressReportPrompt] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

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

  function clearLongPressTimer(): void {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // 组件卸载时（比如评论列表因为父组件重新拉取而整体重渲染）清掉还没
  // 触发的计时器——不清的话，长按到一半突然卸载会在卸载之后的 setTimeout
  // 回调里调用 setShowLongPressReportPrompt，触发"在已卸载组件上调用
  // setState"的警告。
  useEffect(() => clearLongPressTimer, []);

  function beginLongPress(x: number, y: number): void {
    if (!canAct) return;
    longPressStartRef.current = { x, y };
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setShowLongPressReportPrompt(true);
    }, LONG_PRESS_MS);
  }

  function updateLongPress(x: number, y: number): void {
    const start = longPressStartRef.current;
    if (!start) return;
    if (
      Math.abs(x - start.x) > LONG_PRESS_MOVE_CANCEL_PX ||
      Math.abs(y - start.y) > LONG_PRESS_MOVE_CANCEL_PX
    ) {
      clearLongPressTimer();
    }
  }

  function endLongPress(): void {
    clearLongPressTimer();
  }

  function handleContentMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    beginLongPress(event.clientX, event.clientY);
    // 挂在 window 上而不是内容区域自己身上——按住之后指针很容易移出这块
    // 不大的区域，只挂元素自己的话移出范围后就收不到后续的
    // mousemove/mouseup，长按判定会不准确，跟 conversation-swipe-row.tsx
    // 的拖动手势是同一个理由。一次性监听器，长按判定结束（不管是弹出了
    // 举报入口还是提前松手取消）立刻摘除，不常驻。
    function handleWindowMouseMove(moveEvent: MouseEvent): void {
      updateLongPress(moveEvent.clientX, moveEvent.clientY);
    }
    function handleWindowMouseUp(): void {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      endLongPress();
    }
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }

  function handleContentTouchStart(event: ReactTouchEvent<HTMLDivElement>): void {
    const touch = event.touches[0];
    if (!touch) return;
    beginLongPress(touch.clientX, touch.clientY);
  }

  function handleContentTouchMove(event: ReactTouchEvent<HTMLDivElement>): void {
    const touch = event.touches[0];
    if (!touch) return;
    updateLongPress(touch.clientX, touch.clientY);
  }

  function handleContentTouchEnd(): void {
    endLongPress();
  }

  function handleOpenReportFromLongPress(): void {
    setShowLongPressReportPrompt(false);
    setActiveAction("report");
    // 跟 toggleAction 一样，展开举报表单前清掉其它操作可能留下的错误
    // 提示——这里不能直接复用 toggleAction("report")，那个函数是"toggle"
    // 语义（再点一次会关掉），这里始终是"打开"，两种语义不一样。
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
  // 33 号卡：顶层评论头像 32px，回复头像 24px——回复本身已经靠 indentPx
  // 缩进表达了"层级更深"，头像跟着缩小一档视觉上更协调，也给深层回复
  // （缩进 + 头像 + 昵称 + 时间挤在一行）省一点横向空间。
  const avatarSizeClass = depth === 0 ? "h-8 w-8" : "h-6 w-6";
  const avatarInitialTextClass = depth === 0 ? "text-xs" : "text-[10px]";

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
            {/* 33 号卡：这一整块（头像+昵称+时间+正文）是长按弹出举报入口的
                触发区域，不含下面回复/删除按钮那一行——那一行本身就是可点击
                按钮，混进长按区域会跟点击手势冲突。onContextMenu 拦掉移动端
                长按时浏览器原生弹出的"复制/分享"上下文菜单，不然会跟这里
                自定义的长按菜单打架。 */}
            <div
              data-testid="comment-content"
              className="flex items-start gap-2"
              onMouseDown={handleContentMouseDown}
              onTouchStart={handleContentTouchStart}
              onTouchMove={handleContentTouchMove}
              onTouchEnd={handleContentTouchEnd}
              onTouchCancel={handleContentTouchEnd}
              onContextMenu={(event) => event.preventDefault()}
            >
              {node.authorAvatarUrl ? (
                <img
                  src={node.authorAvatarUrl}
                  alt=""
                  className={`${avatarSizeClass} shrink-0 rounded-full object-cover`}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={`flex ${avatarSizeClass} shrink-0 items-center justify-center rounded-full bg-primary/10 ${avatarInitialTextClass} font-semibold text-primary`}
                >
                  {node.authorDisplayName.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
              <div className="min-w-0 flex-1">
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
              </div>
            </div>

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

            {/* 33 号卡：长按内容区域弹出的举报入口——只有一个"举报"按钮，
                点了之后关闭这个浮层、展开上面 activeAction === "report" 那
                一整块（举报原因/补充说明/提交，原样复用，见组件顶部注释）。
                居中小 sheet，不是贴着长按位置的气泡菜单，理由见组件顶部
                注释。 */}
            {showLongPressReportPrompt ? (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="留言操作"
                className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
                onClick={() => setShowLongPressReportPrompt(false)}
              >
                <div
                  className="w-full max-w-xs rounded-2xl bg-white p-2 shadow-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={handleOpenReportFromLongPress}
                    className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger/10"
                  >
                    举报
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLongPressReportPrompt(false)}
                    className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-text hover:bg-bg"
                  >
                    取消
                  </button>
                </div>
              </div>
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
