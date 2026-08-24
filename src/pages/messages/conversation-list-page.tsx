import { Bell } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useMyConversationsQuery } from "../../features/conversations/use-my-conversations-query";
import { useAuthStore } from "../../store/auth-store";
import { useConversationListPreferencesStore } from "../../store/conversation-list-preferences-store";
import { ConversationSwipeRow } from "./conversation-swipe-row";

const EMPTY_LIST_MESSAGE = "暂无消息";
const LOAD_ERROR_MESSAGE = "会话加载失败，请稍后重试。";

/**
 * 顶部栏通知铃铛的目标路径——06 号卡只要求"消息"Tab 顶部右侧有一个通知
 * 铃铛图标，这个仓库目前没有独立的"系统通知列表"页面（系统通知目前是
 * 混在会话列表里的一条特殊会话，见 conversation-swipe-row.tsx 里
 * originType === 'system' 那部分处理），跟 profile-page.tsx 的
 * SETTINGS_PATH 是同一个"先接入占位路径"处理方式：routes.tsx 里没有
 * 匹配的路由，点击会落到全局通配符 NotFoundPage，不是死链接/报错。
 */
const NOTIFICATIONS_PATH = "/notifications";

/**
 * 会话列表页（/messages），登录态鉴权统一由路由层的 RequireAuth 包裹实现
 * （见 routes.tsx），页面内部不做登录检查/跳转（CLAUDE.md 的统一规则）。
 *
 * 10 号卡（消息列表扁平化 + 左滑屏蔽入口）：单行渲染逻辑（头像/昵称/预览/
 * 时间/未读点/左滑菜单/屏蔽状态）整个下沉到新的 conversation-swipe-row.tsx
 * 组件——这个页面现在只负责"取数据 → 过滤掉本地隐藏/已删除的会话 → 決定
 * 哪一行处于滑开状态 → 渲染扁平的 <ul>"，不再直接拼一行的 DOM。
 *
 * 列表容器改成 divide-y divide-border（对应 saminest_final_screens.html
 * 的 --line token，这个仓库已经落地成 --color-border/border-border，
 * 两者是同一个值 #ececef），去掉每行原来的圆角/投影/白底卡片/行间距——
 * 通栏铺满，只靠这一条分隔线区隔，是这次任务卡明确要求的视觉改动。
 *
 * openRowId：同一时间最多一行处于"左滑菜单打开"状态，滑开新的一行会
 * 自动收起上一行——这个状态提到页面这一层持有（而不是每行自己独立维护），
 * 是实现"只能有一行打开"这条常见交互约束最直接的办法，不需要每一行反过来
 * 感知其它行的开合状态。
 *
 * "标为未读/不显示/删除"三项走 useConversationListPreferencesStore（纯
 * 本地、localStorage 持久化，不涉及后端关系表）——具体为什么不接后端字段，
 * 见那个 store 文件顶部的详细说明。这个页面负责：
 *   - 用 hiddenConversationIds/deletedConversationIds 过滤掉不应该再显示
 *     的会话（"不显示"和"删除"目前行为上是同一件事——都是从我的列表视图里
 *     移除这一行，只是分别记在两个独立的集合里，为将来可能的"不显示"可
 *     撤销、"删除"更彻底这类产品分化留出空间，不是重复实现）。
 *   - 把 manuallyUnreadIds 里对应会话 id 的"手动标为未读"状态传给每一行，
 *     行内部跟服务端算出来的 isUnread 合并展示；行内真正被点击导航进入
 *     会话时（onNavigate），顺带调用 clearManualUnread 清掉这个标记。
 *
 * "屏蔽"这一项在 conversation-swipe-row.tsx 内部直接用现成的
 * useIsBlockingQuery/useBlockUserMutation/useUnblockUserMutation 三个
 * hook，这个页面不需要关心屏蔽状态本身，只负责把 currentUserId 传下去。
 */
export function ConversationListPage() {
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.session)?.user.id;
  const { data: conversations, isPending, isError } = useMyConversationsQuery();

  const manuallyUnreadIds = useConversationListPreferencesStore((s) => s.manuallyUnreadIds);
  const hiddenConversationIds = useConversationListPreferencesStore((s) => s.hiddenConversationIds);
  const deletedConversationIds = useConversationListPreferencesStore(
    (s) => s.deletedConversationIds
  );
  const markAsUnread = useConversationListPreferencesStore((s) => s.markAsUnread);
  const clearManualUnread = useConversationListPreferencesStore((s) => s.clearManualUnread);
  const hideConversation = useConversationListPreferencesStore((s) => s.hideConversation);
  const deleteConversation = useConversationListPreferencesStore((s) => s.deleteConversation);

  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const visibleConversations = (conversations ?? []).filter(
    (conversation) =>
      !hiddenConversationIds[conversation.id] && !deletedConversationIds[conversation.id]
  );

  return (
    <main className="pb-20 md:pb-6">
      <TopBar
        variant="tab"
        title="消息"
        right={{
          icon: <Bell size={18} aria-hidden="true" />,
          label: "通知",
          onClick: () => navigate(NOTIFICATIONS_PATH)
        }}
      />
      {/* TopBar 本身不套 max-w（全宽横跨视口，跟 categories-page.tsx/
          activity-list-page.tsx 同一个约定）；列表容器这次也不再套水平
          内边距（px-4）——扁平通栏列表要求内容真正铺满到视口边缘，内边距
          放进了 conversation-swipe-row.tsx 每一行自己的 px-4，不是这个
          容器的责任，跟改版前的 max-w-2xl 宽度限制保持一致（仍然套在
          最外层）。 */}
      <div className="mx-auto max-w-2xl py-2">
        {isPending ? (
          <p role="status" className="px-4 text-sm text-text-muted">加载中…</p>
        ) : null}
        {isError ? (
          <p role="alert" className="mx-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {LOAD_ERROR_MESSAGE}
          </p>
        ) : null}
        {!isPending && !isError && conversations && visibleConversations.length === 0 ? (
          <p role="status" className="px-4 text-sm text-text-muted">{EMPTY_LIST_MESSAGE}</p>
        ) : null}
        {!isPending && !isError && visibleConversations.length > 0 ? (
          <ul className="divide-y divide-border">
            {visibleConversations.map((conversation) => (
              <ConversationSwipeRow
                key={conversation.id}
                conversation={conversation}
                currentUserId={currentUserId}
                isOpen={openRowId === conversation.id}
                onOpen={() => setOpenRowId(conversation.id)}
                onClose={() =>
                  setOpenRowId((current) => (current === conversation.id ? null : current))
                }
                isManuallyUnread={!!manuallyUnreadIds[conversation.id]}
                onMarkAsUnread={() => markAsUnread(conversation.id)}
                onHide={() => hideConversation(conversation.id)}
                onDelete={() => deleteConversation(conversation.id)}
                onNavigate={() => clearManualUnread(conversation.id)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
