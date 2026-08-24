import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConversationListPreferencesState {
  /** 手动标为未读的会话 id 集合——用 Record<string, true> 而不是 Set，
   *  理由跟下面 persist 的说明一致：Set 不能直接被 JSON.stringify/parse，
   *  persist 中间件默认用 JSON 做序列化，Record 是"值不重要、只关心 key
   *  是否存在"这种集合语义最省事的 JSON 原生表示。 */
  manuallyUnreadIds: Record<string, true>;
  hiddenConversationIds: Record<string, true>;
  deletedConversationIds: Record<string, true>;
  markAsUnread: (conversationId: string) => void;
  /** 打开这条会话（真正点进去查看）时清掉手动标记，见
   *  conversation-list-page.tsx 的调用点——"标为未读"是一个"提醒我稍后
   *  回来看"的标记，用户已经点进去看过了，这个标记就没有继续存在的意义，
   *  不清掉的话会一直显示"未读"，用户永远没法通过"点开看过"这个自然动作
   *  让它消失，等于这个标记一旦点了就再也去不掉（除非再手动点一次"标为
   *  未读"来"重置"，但当前只有"标为未读"一个方向的入口，没有对应的"标为
   *  已读"菜单项）。 */
  clearManualUnread: (conversationId: string) => void;
  hideConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
}

function withKey(record: Record<string, true>, key: string): Record<string, true> {
  return { ...record, [key]: true };
}

function withoutKey(record: Record<string, true>, key: string): Record<string, true> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 消息列表左滑菜单（10 号卡）里"标为未读 / 不显示 / 删除"这三项的状态——
 * 刻意不落库、不新建任何 migration。10 号卡任务卡原文把这三项定性为
 * "纯 UI 状态操作，不涉及后端关系表"，这是产品这次明确要的范围收敛，不是
 * 遗漏：
 *
 * 1. "删除"字面上最接近的现有后端字段是 conversation_members.left_at
 *    （会话成员表已有列），但检查过 conversations-repository.ts /
 *    对应迁移文件后确认这个字段目前完全没有被消息功能实际使用——
 *    conversations_select_member 这条 RLS（走 is_conversation_member()）
 *    只检查"这个会话是否存在一条我的成员行"，根本不看 left_at，
 *    listMyConversations() 的查询也没有按 left_at 过滤。真要把"删除"接到
 *    这个字段上，还需要额外改 RLS 策略/查询逻辑（走 migration），而且
 *    "退出会话"这个动作在消息发送策略（is_active_conversation_member）
 *    里还有其它含义（决定还能不能在这条会话里继续发消息），贸然复用
 *    left_at 表达"这条会话我不想在列表里看到了"这个纯展示层需求，会把
 *    两个不同语义的概念绑在同一个字段上，属于扩大任务范围，这次没有做。
 * 2. "标为未读"/"不显示"目前完全没有对应的现有字段（conversation_members
 *    只有 last_read_at/is_muted 两个跟这次需求相关性较低的字段，
 *    is_muted 目前也没有被任何 UI 使用）。
 *
 * 因此这三项全部做成纯前端、按 conversationId 维护的本地状态，用
 * Zustand（不是 TanStack Query——这不是服务端数据，符合
 * docs/04_Development/AI-Development.md 5.4 节"Zustand 管理客户端 UI
 * 状态"的边界）+ persist 中间件写进 localStorage（刷新页面/重新打开
 * App 之后仍然生效，不是纯内存态），跟 selected-region-store.ts 是完全
 * 同一个模式、同一个理由。这是当前阶段一个刻意的简化：这些状态只在这一台
 * 设备/这一个浏览器 profile 里生效，换设备登录同一个账号看不到之前"不
 * 显示"/"删除"过的会话——如果以后要做成跨设备同步，需要一份新的后端设计
 * （新表或者在 conversation_members 上加字段），到时候再补，不是这次任务
 * 范围。
 *
 * "屏蔽"这一项刻意不在这个 store 里——屏蔽是已经存在的、真实的服务端关系
 * （user_blocks 表 + is_blocking_query 等 hook），本来就应该继续用
 * TanStack Query（useIsBlockingQuery/useBlockUserMutation/
 * useUnblockUserMutation，见 conversation-swipe-row.tsx），不应该在这个
 * 纯客户端 store 里重复维护一份影子状态——那样会造成 5.4 节明确列为反模式
 * 的"用 Zustand 缓存本应由 TanStack Query 管理的服务端数据"，也会导致这
 * 里和 conversation-page.tsx 头部菜单显示的屏蔽状态不同步（本卡验收标准
 * 明确要求两处共享同一条数据库记录）。
 */
export const useConversationListPreferencesStore = create<ConversationListPreferencesState>()(
  persist(
    (set) => ({
      manuallyUnreadIds: {},
      hiddenConversationIds: {},
      deletedConversationIds: {},
      markAsUnread: (conversationId) =>
        set((state) => ({
          manuallyUnreadIds: withKey(state.manuallyUnreadIds, conversationId)
        })),
      clearManualUnread: (conversationId) =>
        set((state) => ({
          manuallyUnreadIds: withoutKey(state.manuallyUnreadIds, conversationId)
        })),
      hideConversation: (conversationId) =>
        set((state) => ({
          hiddenConversationIds: withKey(state.hiddenConversationIds, conversationId)
        })),
      deleteConversation: (conversationId) =>
        set((state) => ({
          deletedConversationIds: withKey(state.deletedConversationIds, conversationId)
        }))
    }),
    { name: "saminest-conversation-list-preferences" }
  )
);
