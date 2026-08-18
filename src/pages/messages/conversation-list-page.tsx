import { Link } from "react-router-dom";

import { useMyConversationsQuery } from "../../features/conversations/use-my-conversations-query";
import { formatPublishedAt } from "../../utils/format";

const EMPTY_LIST_MESSAGE = "暂无消息";
const LOAD_ERROR_MESSAGE = "会话加载失败，请稍后重试。";

/**
 * 会话列表页（/messages），登录态鉴权统一由路由层的 RequireAuth 包裹实现
 * （见 routes.tsx），页面内部不做登录检查/跳转（CLAUDE.md 的统一规则）。
 *
 * 每一行改成左边头像 + 右边信息列，显示对方的真实头像/昵称，不再是"买家/
 * 卖家"这种身份标签——头像有图用 <img>，没有就用昵称首字母圆形占位，跟
 * profile-page.tsx 现有的头像展示逻辑是同一套写法。项目目前没有头像上传
 * 功能，profiles.avatar_url 实际上恒为 null（同一条注释见
 * profile-page.tsx），所以这次改完之后，在头像上传功能上线前，用户看到
 * 的对方头像大概率还是昵称首字母占位，不是真实图片——这是当前产品阶段的
 * 已知限制，不是这次任务没做完。
 *
 * 这一轮仍然不展示"最后一条消息预览"文字，只做时间排序（产品要求里消息
 * 预览是可选项，这次没有做，保持范围聚焦）。
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
          {conversations.map((conversation) => {
            const avatarInitial =
              conversation.otherDisplayName?.trim().charAt(0).toUpperCase() || "?";
            return (
              <li key={conversation.id}>
                <Link
                  to={`/messages/${conversation.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-white p-4 hover:border-primary"
                >
                  {conversation.otherAvatarUrl ? (
                    <img
                      src={conversation.otherAvatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-sm font-semibold text-text-muted"
                    >
                      {avatarInitial}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">
                      {conversation.otherDisplayName ?? "对方"}
                    </span>
                    {conversation.postTitle ? (
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        关于：{conversation.postTitle}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {formatPublishedAt(conversation.lastActivityAt)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
