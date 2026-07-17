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
    <main>
      <h1>消息</h1>
      {isPending ? <p role="status">加载中…</p> : null}
      {isError ? <p role="alert">{LOAD_ERROR_MESSAGE}</p> : null}
      {!isPending && !isError && conversations && conversations.length === 0 ? (
        <p role="status">{EMPTY_LIST_MESSAGE}</p>
      ) : null}
      {!isPending && !isError && conversations && conversations.length > 0 ? (
        <ul>
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link to={`/messages/${conversation.id}`}>
                <span>{OTHER_PARTY_ROLE_LABEL[conversation.otherPartyRole]}</span>
                {conversation.postTitle ? <span>关于：{conversation.postTitle}</span> : null}
                <span>{formatPublishedAt(conversation.lastActivityAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
