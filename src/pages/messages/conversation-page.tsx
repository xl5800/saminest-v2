import { type FormEvent, useState } from "react";
import { useParams } from "react-router-dom";

import { useMessagesQuery } from "../../features/messages/use-messages-query";
import { useSendMessageMutation } from "../../features/messages/use-send-message-mutation";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";

const MESSAGE_MAX_LENGTH = 5000;
const EMPTY_MESSAGE_ERROR = "请输入消息内容。";
const MESSAGE_TOO_LONG_ERROR = `消息内容不能超过 ${MESSAGE_MAX_LENGTH} 字。`;
const DEFAULT_ERROR_MESSAGE = "发送失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再发送消息。";
const EMPTY_CONVERSATION_MESSAGE = "还没有消息，发一条打个招呼吧。";
const LOAD_ERROR_MESSAGE = "消息加载失败，请刷新页面重试。";

/**
 * 一对一会话详情页（/messages/:conversationId）。命名特意避开
 * "MessagesPage" / "ConversationsPage" 这类容易被理解成"我的会话列表"的
 * 名字——那是明确out of scope 的另一个页面（见任务范围说明），这里只是
 * 单个会话的收发页面。
 *
 * 登录态鉴权统一由路由层的 RequireAuth 包裹实现（见 routes.tsx），页面
 * 内部不做登录检查/跳转，这是这个项目的统一规则（见 CLAUDE.md）。这里仍然
 * 读取 session 拿当前用户 id，一是用来给每条消息打"我"/"对方"标签，二是
 * 发送时的 senderId，并在提交时做一次防御性判断（参照
 * report-post-page.tsx 的 reporterId 写法）：正常情况下 RequireAuth 已经
 * 保证进到这个页面时是登录状态，这个判断只应对 session 中途失效这种边缘
 * 情况，不是路由鉴权本身。
 *
 * 按产品要求，这一轮只区分"我"/"对方"，不拉取、不展示对方的头像/昵称等
 * profile 信息（见任务范围说明），所以这里没有任何 profile 相关的查询。
 */
export function MessageConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.user.id;

  const {
    data: messages,
    isPending: messagesPending,
    isError: messagesError
  } = useMessagesQuery(conversationId ?? "");
  const sendMessageMutation = useSendMessageMutation(conversationId ?? "");

  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">会话</h1>
      {messagesPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}
      {messagesError ? (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {LOAD_ERROR_MESSAGE}
        </p>
      ) : null}
      {!messagesPending && !messagesError && messageList.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">{EMPTY_CONVERSATION_MESSAGE}</p>
      ) : null}
      {!messagesPending && !messagesError && messageList.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-2">
          {messageList.map((message) => {
            const label = message.senderId === currentUserId ? "我" : "对方";
            const isMine = label === "我";
            return (
              <li key={message.id} className={isMine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    isMine
                      ? "max-w-[75%] break-words rounded-lg bg-primary px-3 py-2 text-sm text-white"
                      : "max-w-[75%] break-words rounded-lg bg-bg px-3 py-2 text-sm text-text"
                  }
                >
                  {label}：{message.body}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <form onSubmit={handleSubmit} noValidate className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
        {validationError ? (
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {validationError}
          </p>
        ) : null}
        {submitError ? (
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {submitError}
          </p>
        ) : null}
        <label className="block text-sm font-medium text-text">
          消息内容
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <button
          type="submit"
          disabled={sendMessageMutation.isPending}
          className="self-end rounded bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sendMessageMutation.isPending ? "发送中…" : "发送"}
        </button>
      </form>
    </main>
  );
}
