import { Link } from "react-router-dom";

import { useMyConversationsQuery } from "../../features/conversations/use-my-conversations-query";
import { formatPublishedAt } from "../../utils/format";

const EMPTY_LIST_MESSAGE = "暂无消息";
const LOAD_ERROR_MESSAGE = "会话加载失败，请稍后重试。";

const OTHER_PARTY_ROLE_LABEL = {
  buyer: "买家",
  seller: "卖家"
} as const;

/**
 * 会话列表页（/messages），登录态鉴权统一由路由层的 RequireAuth 包裹实现
 * （见 routes.tsx），页面内部不做登录检查/跳转（CLAUDE.md 的统一规则）。
 *
 * 只区分/展示对方是"买家"还是"卖家"这个角色标签，不拉取、不展示对方的
 * 头像/昵称等 profile 信息——跟 conversation-page.tsx 是同一个产品方向，
 * 这里延续同样的克制，不额外发起 profile 查询。
 *
 * 同理，这一轮不展示"最后一条消息预览"文字，只做时间排序（产品要求里
 * 消息预览是可选项，这次没有做，保持范围聚焦）。
 */
export function ConversationListPage() {
  const { data: conversations, isPending, isError } = useMyConversationsQuery();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">消息</h1>
      {isPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}
      {isError ? (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {LOAD_ERROR_MESSAGE}
        </p>
      ) : null}
      {!isPending && !isError && conversations && conversations.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">{EMPTY_LIST_MESSAGE}</p>
      ) : null}
      {!isPending && !isError && conversations && conversations.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to={`/messages/${conversation.id}`}
                className="block rounded-lg border border-border bg-white p-4 hover:border-primary"
              >
                <span className="mr-2 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                  {OTHER_PARTY_ROLE_LABEL[conversation.otherPartyRole]}
                </span>
                {conversation.postTitle ? (
                  <span className="break-words text-sm text-text">关于：{conversation.postTitle}</span>
                ) : null}
                <span className="mt-1 block text-xs text-text-muted">
                  {formatPublishedAt(conversation.lastActivityAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
