import { Link } from "react-router-dom";

import { AdminNav } from "../../components/admin-nav";
import { TopBar } from "../../components/top-bar";
import { useAdminSupportConversationsQuery } from "../../features/admin/use-admin-support-conversations-query";
import { formatPublishedAt } from "../../utils/format";

const LOAD_ERROR_MESSAGE = "客服会话加载失败，请稍后重试。";
const EMPTY_MESSAGE = "暂无客服会话";

/**
 * 联系客服改成真聊天任务卡：管理员客服会话列表（/admin/support，替掉
 * AdminNav 里原来指向 /admin/feedback 的入口，见该组件的说明）。整体
 * 结构（TopBar nav-only + AdminNav + 列表）照抄 admin/feedback-page.tsx，
 * 但这不是一个"处理到清空"的队列页面（那种页面处理完一行就从本地列表
 * 移除，见 feedback-page.tsx 的说明）——客服会话不会因为管理员点开看过、
 * 或者回复过就消失，所以这里没有 feedback-page.tsx 那套"本地列表 state +
 * 处理后移除一行"的机制，单纯依赖 useAdminSupportConversationsQuery 的
 * 数据渲染，回复之后这条会话还应该继续留在列表里（只是排序/预览文字会
 * 因为 last_message_at 更新而变化，见该 hook 的注释）。
 *
 * 列表本身（谁会出现在这里）的业务判断——只列出"用户真的发起过对话"的
 * system 会话（判断标准：这条会话下存在至少一条 sender_id 不为空的
 * 消息），不是全部 system 会话——完全由数据库函数
 * admin_list_support_conversations() 负责，这个页面只管渲染，不在前端
 * 重复实现一遍这条过滤规则。已经按 last_message_at 倒序排，不需要在这
 * 里再排一次。
 *
 * 每一行是一个整行可点的 <Link>，跳到 /admin/support/:conversationId
 * 这个独立的会话详情页（不是弹层/展开），跟 person-card.tsx"整行可点+
 * 头像+昵称+chevron"是同一个视觉语言，这里没有直接复用那个组件——
 * PersonCard 点击后跳的是公开个人主页（/users/:userId），这里跳的是
 * 客服会话详情页，目标语义不一样，硬复用一个"看起来像但语义不同"的组件
 * 不如照着同一个视觉语言单独写一份简单直接。
 */
export function AdminSupportConversationsPage() {
  const { data, isPending, isError } = useAdminSupportConversationsQuery();

  return (
    <main>
      <TopBar variant="nav-only" title="客服" />
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <AdminNav />
        {isPending ? (
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        ) : null}
        {isError ? (
          <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {LOAD_ERROR_MESSAGE}
          </p>
        ) : null}
        {!isPending && !isError && (data ?? []).length === 0 ? (
          <p role="status" className="text-sm text-text-muted">{EMPTY_MESSAGE}</p>
        ) : null}
        {!isPending && !isError && (data ?? []).length > 0 ? (
          <ul className="divide-y divide-divider overflow-hidden rounded-lg border border-border bg-card">
            {(data ?? []).map((item) => {
              const initial = item.displayName.trim().charAt(0).toUpperCase() || "?";
              return (
                <li key={item.conversationId}>
                  <Link
                    to={`/admin/support/${item.conversationId}`}
                    className="flex items-center gap-3 p-4 hover:bg-bg"
                  >
                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                      >
                        {initial}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-text">
                          {item.displayName}
                        </span>
                        {item.lastMessageAt ? (
                          <span className="shrink-0 text-xs text-text-muted">
                            {formatPublishedAt(item.lastMessageAt)}
                          </span>
                        ) : null}
                      </span>
                      {item.lastMessagePreview ? (
                        <span className="mt-0.5 block truncate text-xs text-text-muted">
                          {item.lastMessagePreview}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
