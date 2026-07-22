import { Fragment, type FormEvent, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useMyConversationsQuery } from "../../features/conversations/use-my-conversations-query";
import { useMessagesQuery } from "../../features/messages/use-messages-query";
import { useSendMessageMutation } from "../../features/messages/use-send-message-mutation";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { formatMessageTimeDivider, shouldShowMessageTimeDivider } from "../../utils/format";

const MESSAGE_MAX_LENGTH = 5000;
const EMPTY_MESSAGE_ERROR = "请输入消息内容。";
const MESSAGE_TOO_LONG_ERROR = `消息内容不能超过 ${MESSAGE_MAX_LENGTH} 字。`;
const DEFAULT_ERROR_MESSAGE = "发送失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再发送消息。";
const EMPTY_CONVERSATION_MESSAGE = "还没有消息，发一条打个招呼吧。";
const LOAD_ERROR_MESSAGE = "消息加载失败，请刷新页面重试。";
const DEFAULT_OTHER_PARTY_LABEL = "对方";

const OTHER_PARTY_ROLE_LABEL = {
  buyer: "买家",
  seller: "卖家"
} as const;

/**
 * 一对一会话详情页（/messages/:conversationId）。命名特意避开
 * "MessagesPage" / "ConversationsPage" 这类容易被理解成"我的会话列表"的
 * 名字——那是明确out of scope 的另一个页面（见任务范围说明），这里只是
 * 单个会话的收发页面。
 *
 * 登录态鉴权统一由路由层的 RequireAuth 包裹实现（见 routes.tsx），页面
 * 内部不做登录检查/跳转，这是这个项目的统一规则（见 CLAUDE.md）。这里仍然
 * 读取 session 拿当前用户 id，一是用来决定消息气泡左右位置，二是发送时的
 * senderId，并在提交时做一次防御性判断（参照
 * report-post-page.tsx 的 reporterId 写法）：正常情况下 RequireAuth 已经
 * 保证进到这个页面时是登录状态，这个判断只应对 session 中途失效这种边缘
 * 情况，不是路由鉴权本身。
 *
 * Header 复用现有会话摘要查询展示当前已经具备的买家/卖家身份和帖子标题。
 * 当前会话模型没有返回对方 profile，因此使用身份首字作为头像占位，不为
 * 纯布局需求新增 profile 查询或修改 repository 行为。
 */
export function MessageConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.user.id;

  const {
    data: messages,
    isPending: messagesPending,
    isError: messagesError
  } = useMessagesQuery(conversationId ?? "");
  const sendMessageMutation = useSendMessageMutation(conversationId ?? "");
  const { data: conversations } = useMyConversationsQuery();

  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const conversation = conversations?.find((item) => item.id === conversationId);
  const otherPartyLabel = conversation
    ? OTHER_PARTY_ROLE_LABEL[conversation.otherPartyRole]
    : DEFAULT_OTHER_PARTY_LABEL;
  const conversationContext = conversation?.postTitle
    ? `关于 ${conversation.postTitle}`
    : "私信会话";

  function handleBack(): void {
    if (location.key === "default") {
      navigate("/messages", { replace: true });
      return;
    }
    navigate(-1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (sendMessageMutation.isPending) return;

    setValidationError(null);
    setSubmitError(null);

    const senderId = currentUserId;
    if (!senderId) {
      setSubmitError(SESSION_EXPIRED_MESSAGE);
      return;
    }

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setValidationError(EMPTY_MESSAGE_ERROR);
      return;
    }
    if (trimmedBody.length > MESSAGE_MAX_LENGTH) {
      setValidationError(MESSAGE_TOO_LONG_ERROR);
      return;
    }

    try {
      await sendMessageMutation.mutateAsync({ senderId, body: trimmedBody });
      setBody("");
    } catch (error) {
      // 跟 report-post-page.tsx 的 REPORT_DUPLICATE 分支同一个模式：账号
      // 受限是一个明确、可操作的失败原因（重试没有用），跟其它未知失败
      // 原因共用一条"请稍后重试"文案会误导用户。
      if (error instanceof AppError && error.code === "ACCOUNT_RESTRICTED") {
        setSubmitError(error.message);
      } else {
        setSubmitError(DEFAULT_ERROR_MESSAGE);
      }
    }
  }

  const messageList = messages ?? [];
  const sendDisabled = sendMessageMutation.isPending || body.trim().length === 0;

  return (
    <main className="mx-auto grid h-dvh w-full max-w-2xl grid-rows-[3.5rem_minmax(0,1fr)_auto] overflow-hidden bg-bg">
      <header className="grid h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center border-b border-border bg-white px-2">
        <button
          type="button"
          aria-label="返回"
          onClick={handleBack}
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-text hover:bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          ←
        </button>

        <div className="flex min-w-0 items-center justify-center gap-2 px-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          >
            {otherPartyLabel.charAt(0)}
          </span>
          <div className="min-w-0 text-left">
            <h1 className="truncate text-base font-semibold text-text">{otherPartyLabel}</h1>
            <p className="truncate text-xs text-text-muted">{conversationContext}</p>
          </div>
        </div>

        <button
          type="button"
          aria-label="更多会话选项（暂不可用）"
          disabled
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          ⋯
        </button>
      </header>

      <section
        aria-label="消息记录"
        data-testid="conversation-messages"
        className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 pb-6"
      >
        {messagesPending ? (
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        ) : null}
        {messagesError ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {LOAD_ERROR_MESSAGE}
          </p>
        ) : null}
        {!messagesPending && !messagesError && messageList.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-6 text-center">
            <p role="status" className="text-sm text-text-muted">{EMPTY_CONVERSATION_MESSAGE}</p>
          </div>
        ) : null}
        {!messagesPending && !messagesError && messageList.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {messageList.map((message, index) => {
              const previousMessage = messageList[index - 1];
              const showTimeDivider = shouldShowMessageTimeDivider(
                message.createdAt,
                previousMessage ? previousMessage.createdAt : null
              );
              const isMine = message.senderId === currentUserId;
              return (
                <Fragment key={message.id}>
                  {showTimeDivider ? (
                    <li className="flex justify-center">
                      <time
                        dateTime={message.createdAt}
                        className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-text-muted"
                      >
                        {formatMessageTimeDivider(message.createdAt)}
                      </time>
                    </li>
                  ) : null}
                  <li
                    data-message-owner={isMine ? "self" : "other"}
                    aria-label={isMine ? "我发送的消息" : "对方发送的消息"}
                    className={isMine ? "flex justify-end" : "flex justify-start"}
                  >
                    <div className={`flex min-w-0 max-w-[75%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                      <div
                        className={
                          isMine
                            ? "min-w-0 whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-sm text-white [overflow-wrap:anywhere]"
                            : "min-w-0 whitespace-pre-wrap rounded-2xl bg-white px-3 py-2 text-sm text-text [overflow-wrap:anywhere]"
                        }
                      >
                        {message.body}
                      </div>
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        ) : null}
      </section>

      <form
        onSubmit={handleSubmit}
        noValidate
        data-testid="conversation-composer"
        className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-border bg-white px-4 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {validationError ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {validationError}
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {submitError}
          </p>
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">消息内容</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={1}
              placeholder="输入消息"
              className="h-12 w-full resize-none overflow-y-auto rounded-2xl border border-border bg-bg px-4 py-3 text-base leading-6 text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <button
            type="submit"
            disabled={sendDisabled}
            className="h-12 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendMessageMutation.isPending ? "发送中…" : "发送"}
          </button>
        </div>
      </form>
    </main>
  );
}
