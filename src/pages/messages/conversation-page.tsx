import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Fragment, type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { useBlockUserMutation } from "../../features/blocks/use-block-user-mutation";
import { useIsBlockedPairQuery } from "../../features/blocks/use-is-blocked-pair-query";
import { useIsBlockingQuery } from "../../features/blocks/use-is-blocking-query";
import { useUnblockUserMutation } from "../../features/blocks/use-unblock-user-mutation";
import { useMyConversationsQuery } from "../../features/conversations/use-my-conversations-query";
import { useMessagesQuery } from "../../features/messages/use-messages-query";
import { useSendMessageMutation } from "../../features/messages/use-send-message-mutation";
import { markConversationAsRead } from "../../repositories/conversations-repository";
import type { NotificationPayload } from "../../repositories/messages-repository";
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
const SYSTEM_NOTIFICATION_LABEL = "Saminest 通知";
const SYSTEM_NOTIFICATION_SUBTITLE = "官方通知";
const BLOCK_ACTION_ERROR_MESSAGE = "操作失败，请稍后重试。";
const BLOCKED_COMPOSER_MESSAGE = "你们之间存在屏蔽关系，无法互发消息。";

interface AvatarProps {
  avatarUrl: string | null;
  initial: string;
  sizeClassName: string;
  testId?: string;
}

/**
 * 头像通用展示逻辑：有图用 <img>，没有就用昵称首字母圆形占位——header
 * 和消息气泡旁边的头像共用这一份逻辑，只是尺寸不一样（sizeClassName 由
 * 调用方传入），不写两份几乎一样的 img/占位判断。
 */
function Avatar({ avatarUrl, initial, sizeClassName, testId }: AvatarProps) {
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      data-testid={testId}
      className={`${sizeClassName} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      data-testid={testId}
      className={`flex ${sizeClassName} shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary`}
    >
      {initial}
    </span>
  );
}

interface SystemNotificationCardProps {
  payload: NotificationPayload;
  createdAt: string;
}

/**
 * 系统通知消息（message.senderId === null）的卡片渲染——不走聊天气泡那套
 * "isMine 左右 + 头像/占位对齐"逻辑，图标 + 标题（加粗）+ 摘要（小字）+
 * 时间，整张卡片占满可用宽度（不是 75% 那种气泡宽度）。有 link 时整张
 * 卡片是一个 <Link>，点击跳转；没有 link 就是纯展示，不可点——用
 * `payload.link != null` 判断，跟 null/undefined 都不算"有链接"。
 */
function SystemNotificationCard({ payload, createdAt }: SystemNotificationCardProps) {
  const content = (
    <div className="flex w-full items-start gap-3 rounded-2xl border border-border bg-white p-3">
      <div
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
      >
        <Bell size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{payload.title}</p>
        {payload.summary ? (
          <p className="mt-0.5 text-xs text-text-muted">{payload.summary}</p>
        ) : null}
        <p className="mt-1 text-xs text-text-muted">{formatMessageTimeDivider(createdAt)}</p>
      </div>
    </div>
  );

  return payload.link != null ? (
    <Link to={payload.link} className="block w-full">
      {content}
    </Link>
  ) : (
    content
  );
}

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
 * Header 和消息气泡都改用真实头像/昵称——conversation（useMyConversationsQuery
 * 里当前这一条）现在带出了 otherDisplayName/otherAvatarUrl，otherPartyLabel
 * 直接用 otherDisplayName（找不到时退回 DEFAULT_OTHER_PARTY_LABEL），不再
 * 是"买家/卖家"身份标签。项目目前没有头像上传功能，avatar_url 恒为
 * null——这次改完之后头像上传功能上线前，用户看到的大概率还是昵称首字母
 * 占位，不是真实图片，这是当前产品阶段的已知限制。
 *
 * 消息列表里的头像只在"对方发的消息"（isMine === false）左边显示，且
 * 同一人连续发的几条消息只在第一条旁边显示——复用已有的 previousMessage
 * 变量判断"是不是连续消息的非第一条"（同一发送者 + 中间没有插入时间
 * 分隔线），是的话不渲染头像，只用一个等宽的空 div 占位对齐，不是每条都
 * 重复显示一个头像，效果上接近小红书聊天页那种排布。头像来源是
 * conversation?.otherAvatarUrl（会话级别取一次，不是每条消息单独查），
 * 因为一个会话里"对方"只有一个人。
 *
 * 社交资料页第一批：header 里的头像和 <h1> 昵称各自包一层指向公开个人
 * 主页的 <Link to={`/users/${otherUserId}`}>——昵称仍然保持 <h1> 标签
 * 不变（Link 嵌在 <h1> 内部），不能让 <h1> 本身变成 <a>，否则会丢失这个
 * 页面标题的无障碍语义。conversation?.otherUserId 为 null 时（对方已经
 * 退出会话这种边界情况）退回纯展示，不渲染任何链接。消息气泡旁边那些
 * 小头像不在这次范围内，不加链接。
 *
 * 系统通知（conversation?.originType === 'system'）是一整套独立的展示
 * 分支，不是简单复用"otherUserId 为 null"那条兜底：
 * - header 头像换成 Bell 图标，标题固定"Saminest 通知"，副标题固定
 *   "官方通知"（不是 conversation.postTitle 拼出来的 conversationContext，
 *   系统通知会话本来就不挂在任何帖子下）。
 * - 消息列表里 message.senderId === null（等价于
 *   message.notificationPayload !== null）的消息不走气泡+头像分组那套
 *   逻辑，单独渲染成 SystemNotificationCard；isConsecutiveFromSameSender
 *   的判断显式排除这类消息（加了 !isSystemMessage 条件），否则它们会被
 *   误判成"对方发的普通消息"进而套用头像/spacer 逻辑。
 * - 输入框（整个 <form data-testid="conversation-composer">）不渲染——
 *   没有人会收到回复，不应该让用户以为可以对系统说话。
 *
 * 会话列表未读标记：挂载时对任意会话（不再限定 originType === 'system'）
 * 调用 markConversationAsRead 标记已读——markConversationAsRead 本身早就
 * 是通用实现（只是更新 conversation_members.last_read_at），之前只在系统
 * 会话分支调用是范围限制，不是这个函数只支持系统会话。标记成功后
 * invalidate 会话列表用到的 ["conversations", currentUserId] 这个 query
 * key，这样返回 /messages 列表页时能立刻看到这条会话的未读红点/加粗消失，
 * 不用等到下一次 refetchOnWindowFocus 才刷新——底部导航"消息"图标的未读
 * 红点（hasUnreadSystemNotification，只反映系统通知）这次不跟着改，继续
 * 靠它自己原来的 refetchOnWindowFocus 机制，范围说明里已经写明这是独立
 * 的另一个改动，这次不做。失败只 console.error，不影响页面正常使用——
 * 标记已读是次要副作用，不应该因为它失败就让整个页面报错。
 *
 * UGC 安全功能补齐任务卡 1（屏蔽用户）：header 右上角原来那个禁用的
 * "更多会话选项（暂不可用）"占位按钮，这次实现成真正可点的"…"菜单——
 * 交互模式照抄 top-bar.tsx 的 MoreMenuButton（本地 open state + 点击外部/
 * Escape 关闭、菜单内容点击后冒泡到外层容器统一收起），但没有直接复用
 * 那个组件：这个页面的 header 是自己手写的三栏 grid 布局，不是通过
 * <TopBar variant="detail" /> 渲染的（跟 user-profile-page.tsx 不一样），
 * 把整个 header 换成 TopBar 是一次更大范围的重构，不在这次任务卡的范围内，
 * 所以这里就地实现一份同构但独立的菜单，不算重复造轮子。
 *
 * 菜单只有一个"屏蔽此人/取消屏蔽"项，文案由 useIsBlockingQuery 决定；
 * 系统通知会话（没有"对方"这个人）或者 conversation?.otherUserId 为
 * null（对方已退出会话）时，菜单整体不可用，退回原来那个禁用占位按钮，
 * 不显示一个点了也没有效果的空菜单。
 *
 * 屏蔽状态之外，另外用 useIsBlockedPairQuery 查询"我和对方之间有没有
 * 任一方向的屏蔽关系"，为真时把消息输入框（<form
 * data-testid="conversation-composer">）整个换成一条说明文案，不再让
 * 用户输入后才在提交时收到一条不够准确的失败提示——见
 * messages-repository.ts 里 sendMessage() 对应的注释：数据库层
 * messages_insert_own_as_active_member 策略的 42501 拒绝原因现在有两种
 * （账号受限 / 屏蔽关系），后端异常本身分不出是哪一种，前端能提前查出来的
 * 就不依赖那条兜底文案。这条文案刻意不区分"是我屏蔽了对方"还是"对方屏蔽了
 * 我"——前一种信息用户自己已经能在对方主页的屏蔽按钮上看到，没必要在这里
 * 重复；不区分方向也避免了意外暴露"对方屏蔽了我"这种可能更敏感的单向
 * 信息。系统通知会话继续保持原来"不渲染输入框"的分支不变，加了一层
 * "先判断是不是系统会话，再判断是不是屏蔽关系"。
 */
export function MessageConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const isSystemConversation = conversation?.originType === "system";
  const otherPartyLabel = isSystemConversation
    ? SYSTEM_NOTIFICATION_LABEL
    : conversation?.otherDisplayName ?? DEFAULT_OTHER_PARTY_LABEL;
  const conversationContext = isSystemConversation
    ? SYSTEM_NOTIFICATION_SUBTITLE
    : conversation?.postTitle
      ? `关于 ${conversation.postTitle}`
      : "私信会话";

  const otherUserId = conversation?.otherUserId ?? undefined;
  const canManageBlock = !isSystemConversation && !!otherUserId;
  const { data: isBlocking } = useIsBlockingQuery(currentUserId, otherUserId);
  const { data: isBlockedPair } = useIsBlockedPairQuery(currentUserId, otherUserId);
  const blockMutation = useBlockUserMutation();
  const unblockMutation = useUnblockUserMutation();
  const isBlockActionPending = blockMutation.isPending || unblockMutation.isPending;
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    markConversationAsRead(conversationId, currentUserId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["conversations", currentUserId] });
      })
      .catch((error) => {
        console.error("标记会话已读失败：", error);
      });
  }, [conversationId, currentUserId, queryClient]);

  function handleBack(): void {
    if (location.key === "default") {
      navigate("/messages", { replace: true });
      return;
    }
    navigate(-1);
  }

  async function handleToggleBlock(): Promise<void> {
    // 防御性判断，不是路由鉴权本身——这个路由已经被 RequireAuth 包裹，
    // currentUserId 正常情况下必定存在，这里只应对 session 中途失效这种
    // 边缘情况，跟 handleSubmit 里 senderId 的判断是同一个原则。
    if (!currentUserId || !otherUserId) return;
    if (isBlockActionPending) return;

    setBlockActionError(null);
    try {
      if (isBlocking) {
        await unblockMutation.mutateAsync({ blockerId: currentUserId, blockedId: otherUserId });
      } else {
        await blockMutation.mutateAsync({ blockerId: currentUserId, blockedId: otherUserId });
      }
    } catch {
      setBlockActionError(BLOCK_ACTION_ERROR_MESSAGE);
    }
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
      // 跟 report-post-page.tsx 的 REPORT_DUPLICATE 分支同一个模式：
      // MESSAGE_SEND_FORBIDDEN 是一个明确、可操作的失败原因（重试没有
      // 用），跟其它未知失败原因共用一条"请稍后重试"文案会误导用户。见
      // messages-repository.ts 里 sendMessage() 的注释：这个 code 现在
      // 涵盖账号受限和屏蔽关系两种可能，不再是单一原因，所以文案本身
      // 也不预设具体是哪一种。
      if (error instanceof AppError && error.code === "MESSAGE_SEND_FORBIDDEN") {
        setSubmitError(error.message);
      } else {
        setSubmitError(DEFAULT_ERROR_MESSAGE);
      }
    }
  }

  const messageList = messages ?? [];
  const sendDisabled = sendMessageMutation.isPending || body.trim().length === 0;
  const headerAvatarElement = isSystemConversation ? (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
    >
      <Bell size={18} />
    </div>
  ) : (
    <Avatar
      avatarUrl={conversation?.otherAvatarUrl ?? null}
      initial={otherPartyLabel.charAt(0)}
      sizeClassName="h-9 w-9"
    />
  );

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
          {conversation?.otherUserId ? (
            <Link to={`/users/${conversation.otherUserId}`} className="shrink-0">
              {headerAvatarElement}
            </Link>
          ) : (
            headerAvatarElement
          )}
          <div className="min-w-0 text-left">
            <h1 className="truncate text-base font-semibold text-text">
              {conversation?.otherUserId ? (
                <Link to={`/users/${conversation.otherUserId}`} className="hover:underline">
                  {otherPartyLabel}
                </Link>
              ) : (
                otherPartyLabel
              )}
            </h1>
            <p className="truncate text-xs text-text-muted">{conversationContext}</p>
          </div>
        </div>

        {canManageBlock ? (
          <div ref={menuRef} className="relative justify-self-end">
            <button
              type="button"
              aria-label="更多会话选项"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-text hover:bg-bg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              ⋯
            </button>
            {menuOpen ? (
              <div
                role="menu"
                onClick={() => setMenuOpen(false)}
                className="absolute right-0 top-11 z-20 min-w-[132px] overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleToggleBlock()}
                  disabled={isBlockActionPending}
                  className="block w-full px-4 py-2.5 text-left text-sm text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBlockActionPending ? "处理中…" : isBlocking ? "取消屏蔽" : "屏蔽此人"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            aria-label="更多会话选项（暂不可用）"
            disabled
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            ⋯
          </button>
        )}
      </header>

      <section
        aria-label="消息记录"
        data-testid="conversation-messages"
        className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4 pb-6"
      >
        {blockActionError ? (
          <p role="alert" className="mb-3 rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {blockActionError}
          </p>
        ) : null}
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
              const isSystemMessage = message.notificationPayload !== null;
              // 同一人连续发的消息只在第一条旁边显示头像：上一条存在、
              // 发送者跟这一条相同、且中间没有插入时间分隔线，就算作
              // "连续消息的非第一条"，不重复显示头像。系统通知消息
              // （senderId 为 null）显式排除在外——它们不走这套气泡+
              // 头像分组逻辑，不能被误判成"对方发的普通消息"。
              const isConsecutiveFromSameSender =
                !isMine &&
                !isSystemMessage &&
                previousMessage !== undefined &&
                previousMessage.senderId === message.senderId &&
                !showTimeDivider;
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
                  {isSystemMessage ? (
                    <li
                      data-message-owner="system"
                      aria-label="系统通知"
                      className="flex justify-center"
                    >
                      <SystemNotificationCard
                        payload={message.notificationPayload as NotificationPayload}
                        createdAt={message.createdAt}
                      />
                    </li>
                  ) : (
                    <li
                      data-message-owner={isMine ? "self" : "other"}
                      aria-label={isMine ? "我发送的消息" : "对方发送的消息"}
                      className={isMine ? "flex justify-end" : "flex items-start justify-start gap-2"}
                    >
                      {!isMine ? (
                        isConsecutiveFromSameSender ? (
                          <div aria-hidden="true" data-testid="message-avatar-spacer" className="h-7 w-7 shrink-0" />
                        ) : (
                          <Avatar
                            avatarUrl={conversation?.otherAvatarUrl ?? null}
                            initial={otherPartyLabel.charAt(0)}
                            sizeClassName="h-7 w-7"
                            testId="message-avatar"
                          />
                        )
                      ) : null}
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
                  )}
                </Fragment>
              );
            })}
          </ul>
        ) : null}
      </section>

      {!isSystemConversation && isBlockedPair ? (
        <div
          data-testid="conversation-blocked-banner"
          className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-white px-4 py-3 text-center text-sm text-text-muted"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          {BLOCKED_COMPOSER_MESSAGE}
        </div>
      ) : null}

      {!isSystemConversation && !isBlockedPair ? (
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
      ) : null}
    </main>
  );
}
