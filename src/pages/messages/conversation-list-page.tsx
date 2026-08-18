import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

import { useMyConversationsQuery } from "../../features/conversations/use-my-conversations-query";
import { formatPublishedAt } from "../../utils/format";

const EMPTY_LIST_MESSAGE = "暂无消息";
const LOAD_ERROR_MESSAGE = "会话加载失败，请稍后重试。";
const SYSTEM_NOTIFICATION_LABEL = "Saminest 通知";

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
 *
 * 社交资料页第一批：头像和昵称各自包一层指向公开个人主页的
 * `<Link to={`/users/${otherUserId}`}>`——不能把整行卡片继续做成一个大
 * `<Link to="/messages/:id">`再把头像/昵称嵌套一层 Link 进去（`<a>` 不能
 * 嵌套 `<a>`，浏览器会打断/产生非法 DOM），所以这里把原来"整行一个大
 * Link"拆成两个独立的 Link：头像+昵称指向 /users/:userId，帖子标题+时间
 * 那部分指向 /messages/:id，视觉上还是同一张卡片，只是点不同区域跳转到
 * 不同目的地。otherUserId 为 null 时（对方已退出会话这种边界情况）头像/
 * 昵称退回纯展示，不渲染任何链接——没有 userId 也没有页面可以跳。
 *
 * 系统通知（origin_type === 'system'）是另一种、原因完全不同的
 * "otherUserId 为 null"——不是"对方退出了"，是这类会话本来就没有"对方"这
 * 个概念（只有接收者自己一个成员）。不能沿用上面那条"otherUserId 为 null
 * 就退回纯展示"的判断去处理这种情况，否则会显示成一个昵称是 null、退回
 * "对方"文案的普通会话，跟真的"对方退出了"混在一起分不清——必须显式用
 * originType === 'system' 识别，头像换成 Bell 图标（不是 img/首字母
 * 占位），昵称固定显示"Saminest 通知"，同样不包 /users/:id 链接（没有
 * 用户可以跳）。
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
            const isSystemConversation = conversation.originType === "system";
            const avatarInitial =
              conversation.otherDisplayName?.trim().charAt(0).toUpperCase() || "?";
            const nickname = isSystemConversation
              ? SYSTEM_NOTIFICATION_LABEL
              : conversation.otherDisplayName ?? "对方";
            const avatarElement = isSystemConversation ? (
              <div
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
              >
                <Bell size={18} />
              </div>
            ) : conversation.otherAvatarUrl ? (
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
            );
            const showProfileLink = !isSystemConversation && conversation.otherUserId;

            return (
              <li
                key={conversation.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-white p-4 hover:border-primary"
              >
                {showProfileLink ? (
                  <Link to={`/users/${conversation.otherUserId}`} className="shrink-0">
                    {avatarElement}
                  </Link>
                ) : (
                  avatarElement
                )}
                <div className="min-w-0 flex-1">
                  {showProfileLink ? (
                    <Link
                      to={`/users/${conversation.otherUserId}`}
                      className="block truncate text-sm font-medium text-text hover:underline"
                    >
                      {nickname}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-medium text-text">
                      {nickname}
                    </span>
                  )}
                  <Link
                    to={`/messages/${conversation.id}`}
                    data-testid="conversation-link"
                    className="block"
                  >
                    {conversation.postTitle ? (
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        关于：{conversation.postTitle}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {formatPublishedAt(conversation.lastActivityAt)}
                    </span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
