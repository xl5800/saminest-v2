import { Bell } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { Link } from "react-router-dom";

import { useBlockUserMutation } from "../../features/blocks/use-block-user-mutation";
import { useIsBlockingQuery } from "../../features/blocks/use-is-blocking-query";
import { useUnblockUserMutation } from "../../features/blocks/use-unblock-user-mutation";
import type { ConversationListItem } from "../../repositories/conversations-repository";
import { formatPublishedAt } from "../../utils/format";

const SYSTEM_NOTIFICATION_LABEL = "Saminest 通知";
const BLOCK_ACTION_ERROR_MESSAGE = "操作失败，请稍后重试。";

// 四个左滑操作各占的宽度，跟 MENU_WIDTH_PX 一起决定滑开之后露出多少——
// 用固定像素而不是量 DOM 实际宽度：这四个按钮本身就是定宽的（不随内容
// 换行），量测 DOM 宽度只会引入 ResizeObserver/getBoundingClientRect 这类
// 额外复杂度，换不来任何好处，还会在 jsdom 测试环境里因为布局尺寸恒为 0
// 而拿到错误的值。
const ACTION_BUTTON_WIDTH_PX = 72;
const MENU_WIDTH_PX = ACTION_BUTTON_WIDTH_PX * 4;
// 指针按下到抬起之间的水平位移小于这个阈值，算作一次点击（进入会话/收起
// 菜单），大于则算一次拖动——用来在 pointerup 触发的 click 事件里判断要不
// 要 preventDefault() 拦掉这次导航，避免"拖动松手的瞬间被当成点击、
// 意外跳进会话详情页"。
const DRAG_CLICK_THRESHOLD_PX = 8;

const ACTION_BUTTON_CLASS_NAME =
  "flex h-full shrink-0 items-center justify-center px-1 text-center text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60";

interface ConversationSwipeRowProps {
  conversation: ConversationListItem;
  currentUserId: string | undefined;
  /** 当前是不是"滑开、露出操作菜单"这个状态——由父组件
   *  （conversation-list-page.tsx）统一持有，保证同一时间最多一行处于
   *  滑开状态，滑开新的一行会自动收起上一行，不需要这个组件自己维护/
   *  互相感知其它行的状态。 */
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** 这条会话是否被"标为未读"过（本地偏好，见
   *  conversation-list-preferences-store.ts），跟服务端算出来的
   *  conversation.isUnread 是两个独立的信号，这个组件负责把两者合并成
   *  最终展示用的"是否显示未读样式"。 */
  isManuallyUnread: boolean;
  onMarkAsUnread: () => void;
  onHide: () => void;
  onDelete: () => void;
  /** 真正点进这条会话（不是拖动、也不是点掉一个已经滑开的菜单）时调用，
   *  用来清掉"标为未读"这个本地标记——见
   *  conversation-list-preferences-store.ts 里 clearManualUnread 的注释：
   *  用户已经点进去看过了，这个"提醒我稍后回来看"的标记就该消失，否则会
   *  一直显示"未读"、没有任何自然的办法清除。 */
  onNavigate: () => void;
}

/**
 * 消息列表一行——10 号卡（消息列表扁平化 + 左滑屏蔽入口）新增。
 *
 * 10.1 扁平化：这个组件本身不再是一张独立卡片（没有圆角/投影/外边距），
 * 行与行之间的分隔完全交给父组件 <ul> 的 divide-y divide-border（对应
 * saminest_final_screens.html 里 --line 这个 token，这个仓库里已经落地成
 * --color-border/`border-border` 这个 Tailwind 颜色 token，两者是同一个
 * 值 #ececef，不是碰巧的巧合）。
 *
 * 10.2 头像点击行为修正：整行（含头像）现在是同一个 <Link
 * to={`/messages/:id`}>，不再像改版前那样把头像/昵称单独包一层指向
 * /users/:userId 的 Link——点头像和点整行现在是同一个目的地。如果以后
 * 产品又想要"点头像去主页"，需要重新设计交互（比如要跟这一行本身的左滑
 * 手势区分开），不是这次任务的范围。
 *
 * 10.3 左滑菜单：四个操作按钮（标为未读/不显示/屏蔽/删除）绝对定位在
 * 行的右侧，平时被内容区域盖住；内容区域同时接 mouse* 和 touch* 两组
 * 事件实现水平拖动（不是更"现代"的统一 Pointer Events API——这个仓库
 * 测试环境 jsdom 目前没有实现 window.PointerEvent，写了也测不出来，见
 * 下面 beginDrag/updateDrag/endDrag 那段注释），松手时按位移量决定
 * "滑开"还是"收起"（超过菜单宽度一半算滑开）。拖动期间不加 CSS
 * transition（跟手指/鼠标 1:1 跟随），松手后加 200ms 的 transition 做一个
 * 平滑的吸附动画。
 *
 * 拖动 vs 点击的区分：点击事件在指针抬起之后才触发，这里用一个 ref
 * （didDragRef）记录"这次按下-抬起之间有没有发生过明显的水平位移"，点击
 * 处理函数里如果发现刚刚是一次拖动就 event.preventDefault()，防止"拖动
 * 松手的瞬间被误判成点击、意外跳进会话详情页"。菜单已经滑开时点内容区域
 * 也不导航——先把菜单收起，符合"点别处收起已经展开的菜单"这个常见交互
 * 预期，用户需要再点一次才会真的进入会话，不会因为手滑一下就意外导航
 * 走。滑开状态下点击列表外的任意位置（比如别的行、页面其它区域）也会
 * 收起——用跟 top-bar.tsx 的 MoreMenuButton 完全一样的"挂一个
 * document pointerdown 监听器，点击容器外部就收起"模式。
 *
 * "屏蔽"这一项直接复用 useIsBlockingQuery/useBlockUserMutation/
 * useUnblockUserMutation——跟 conversation-page.tsx 头部"…"菜单里那一项
 * 用的是完全同一套 hook、同一个 queryKey（["is-blocking", blockerId,
 * blockedId]），屏蔽/取消屏蔽成功后 invalidateQueries 会让两处的
 * useIsBlockingQuery 都重新拉取，天然保持同步，不需要额外的跨组件通信。
 * 系统通知会话（没有"对方"这个人）或者 otherUserId 为 null（对方已退出
 * 会话）时不显示"屏蔽"这一项，只保留另外三个通用操作——跟
 * user-profile-page.tsx/conversation-page.tsx 对"没有屏蔽对象"场景的
 * 处理是同一个判断。按钮文案用"屏蔽"/"已屏蔽"（不是
 * user-profile-page.tsx 那个独立按钮用的"屏蔽此人"/"取消屏蔽"）——这里是
 * 一个只有两三个字空间的窄操作按钮，文案要更短，但用词依然是"屏蔽"，没有
 * 改用"拉黑"，跟已有实现保持同一个措辞体系。"已屏蔽"用比"屏蔽"更深的颜色
 * （bg-text 深灰，"屏蔽"是 bg-warning 琥珀色）区分两种状态，点击后立刻
 * 原地切换，不需要关闭菜单再重新打开才能看到新状态。
 */
export function ConversationSwipeRow({
  conversation,
  currentUserId,
  isOpen,
  onOpen,
  onClose,
  isManuallyUnread,
  onMarkAsUnread,
  onHide,
  onDelete,
  onNavigate
}: ConversationSwipeRowProps) {
  const containerRef = useRef<HTMLLIElement>(null);
  const dragStartXRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const didDragRef = useRef(false);
  const [dragX, setDragX] = useState<number | null>(null);

  const isSystemConversation = conversation.originType === "system";
  const otherUserId = conversation.otherUserId ?? undefined;
  const canBlock = !isSystemConversation && !!otherUserId;

  const { data: isBlocking } = useIsBlockingQuery(currentUserId, otherUserId);
  const blockMutation = useBlockUserMutation();
  const unblockMutation = useUnblockUserMutation();
  const isBlockActionPending = blockMutation.isPending || unblockMutation.isPending;
  const [blockError, setBlockError] = useState<string | null>(null);

  // 点击容器外部收起已经滑开的菜单——跟 top-bar.tsx 的 MoreMenuButton 是
  // 同一个模式（连监听的事件名都一样用 mousedown，不是 pointerdown/click）。
  // 只在 isOpen 时挂监听器，收起之后自动摘掉，不常驻。
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDownOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDownOutside);
    return () => {
      document.removeEventListener("mousedown", handleMouseDownOutside);
    };
  }, [isOpen, onClose]);

  const translateX = dragX !== null ? dragX : isOpen ? -MENU_WIDTH_PX : 0;

  // 拖动实现故意用 mouse* + touch* 两组事件，没有用更"现代"的统一
  // Pointer Events API——这个仓库测试环境（jsdom）目前不支持
  // window.PointerEvent（截至这次任务用的 jsdom 版本仍是如此，实测
  // fireEvent.pointerDown 在这个环境下拿到的 clientX/pointerId 全部是
  // undefined），如果只写 Pointer Events，这个手势会完全没法写自动化
  // 测试。mouse*（桌面浏览器/这个仓库自己的浏览器预览面板）+ touch*
  // （真机/Capacitor WebView）两组事件分别覆盖桌面和触屏场景，jsdom 对
  // 两者都有正确实现，可以写到真实生效的测试，覆盖面并不比 Pointer
  // Events 差——只是要分别写一遍开始/移动/结束的桥接函数，核心的拖动
  // 计算逻辑（beginDrag/updateDrag/endDrag）是共享的，不重复。
  //
  // dragXRef 是这套逻辑真正的数据来源（不是下面的 dragX state）：
  // updateDrag 同步写这个 ref，endDrag 直接读它，不依赖"上一次 setDragX
  // 触发的重渲染有没有在下一个事件触发前完成"这种时序假设——鼠标/触屏的
  // move 事件可能连续快速触发，不应该让拖动结果的正确性依赖 React 渲染
  // 调度的具体时机。dragX 这个 state 只用来驱动这一帧要不要用
  // transform 展示出来，是 dragXRef 的一份"渲染快照"。
  const dragXRef = useRef<number | null>(null);

  function beginDrag(clientX: number): void {
    dragStartXRef.current = clientX;
    dragStartOffsetRef.current = isOpen ? -MENU_WIDTH_PX : 0;
    didDragRef.current = false;
    dragXRef.current = dragStartOffsetRef.current;
    setDragX(dragXRef.current);
  }

  function updateDrag(clientX: number): void {
    if (dragXRef.current === null) return;
    const delta = clientX - dragStartXRef.current;
    if (Math.abs(delta) > DRAG_CLICK_THRESHOLD_PX) {
      didDragRef.current = true;
    }
    const next = Math.min(0, Math.max(-MENU_WIDTH_PX, dragStartOffsetRef.current + delta));
    dragXRef.current = next;
    setDragX(next);
  }

  function endDrag(): void {
    const finalX = dragXRef.current ?? dragStartOffsetRef.current;
    dragXRef.current = null;
    setDragX(null);
    if (finalX <= -MENU_WIDTH_PX / 2) {
      onOpen();
    } else {
      onClose();
    }
  }

  function handleMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    beginDrag(event.clientX);
    // 挂在 window 上而不是只挂在这个元素自己身上——鼠标拖动过程中指针
    // 很容易移出这个窄的行元素范围，只挂元素自己的话拖出范围之后就收不到
    // 后续的 mousemove/mouseup，拖动会看起来"卡住"。跟点击外部收起菜单
    // 那个 useEffect 不同，这里是一次性的、拖动开始才挂、拖动结束立刻
    // 摘除，不常驻。
    function handleWindowMouseMove(moveEvent: MouseEvent): void {
      updateDrag(moveEvent.clientX);
    }
    function handleWindowMouseUp(): void {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      endDrag();
    }
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>): void {
    const touch = event.touches[0];
    if (!touch) return;
    beginDrag(touch.clientX);
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>): void {
    const touch = event.touches[0];
    if (!touch) return;
    updateDrag(touch.clientX);
  }

  function handleTouchEnd(): void {
    endDrag();
  }

  function handleRowLinkClick(event: React.MouseEvent): void {
    if (didDragRef.current) {
      event.preventDefault();
      didDragRef.current = false;
      return;
    }
    if (isOpen) {
      event.preventDefault();
      onClose();
      return;
    }
    // 不是拖动、菜单也没有滑开：真的要导航进这条会话了，先清掉"标为未读"
    // 这个本地标记（不 preventDefault，让 <Link> 正常导航到
    // /messages/:id）。
    onNavigate();
  }

  function handleMenuActionClick(action: () => void): void {
    action();
    onClose();
  }

  async function handleToggleBlock(): Promise<void> {
    if (!currentUserId || !otherUserId) return;
    if (isBlockActionPending) return;

    setBlockError(null);
    try {
      if (isBlocking) {
        await unblockMutation.mutateAsync({ blockerId: currentUserId, blockedId: otherUserId });
      } else {
        await blockMutation.mutateAsync({ blockerId: currentUserId, blockedId: otherUserId });
      }
      onClose();
    } catch {
      setBlockError(BLOCK_ACTION_ERROR_MESSAGE);
    }
  }

  const avatarInitial = conversation.otherDisplayName?.trim().charAt(0).toUpperCase() || "?";
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

  const effectiveIsUnread = conversation.isUnread || isManuallyUnread;
  const nicknameClassName = effectiveIsUnread
    ? "block truncate text-sm font-bold text-text"
    : "block truncate text-sm font-medium text-text";
  const previewClassName = effectiveIsUnread
    ? "mt-0.5 truncate whitespace-nowrap text-xs font-semibold text-text"
    : "mt-0.5 truncate whitespace-nowrap text-xs text-text-muted";

  return (
    <li ref={containerRef} className="relative">
      <div className="relative overflow-hidden">
        {/* 四个操作按钮平时被内容区域盖住（overflow-hidden 裁掉了视觉上
            超出可见范围的部分），但故意不加 aria-hidden/tabIndex=-1 之类
            的隐藏——它们是真实、随时可点击的 <button>，键盘 Tab 到这一行
            时依然能到达，不因为视觉上还没滑开就被排除在无障碍树/焦点顺序
            之外。这是"左滑手势是给鼠标/触屏用户的一条捷径，键盘用户仍然
            能通过 Tab 到达同样的按钮"这个取舍下的最小实现，没有额外做
            "先弹出一个可聚焦的'更多操作'按钮再展开这四项"这种更完整的
            键盘等效交互——不在这次任务范围内。 */}
        <div className="absolute inset-y-0 right-0 flex" style={{ width: MENU_WIDTH_PX }}>
          <button
            type="button"
            onClick={() => handleMenuActionClick(onMarkAsUnread)}
            style={{ width: ACTION_BUTTON_WIDTH_PX }}
            className={`${ACTION_BUTTON_CLASS_NAME} bg-primary`}
          >
            标为未读
          </button>
          <button
            type="button"
            onClick={() => handleMenuActionClick(onHide)}
            style={{ width: ACTION_BUTTON_WIDTH_PX }}
            className={`${ACTION_BUTTON_CLASS_NAME} bg-text-muted`}
          >
            不显示
          </button>
          {canBlock ? (
            <button
              type="button"
              onClick={() => void handleToggleBlock()}
              disabled={isBlockActionPending}
              style={{ width: ACTION_BUTTON_WIDTH_PX }}
              className={`${ACTION_BUTTON_CLASS_NAME} ${isBlocking ? "bg-text" : "bg-warning"}`}
            >
              {isBlockActionPending ? "处理中…" : isBlocking ? "已屏蔽" : "屏蔽"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleMenuActionClick(onDelete)}
            style={{ width: ACTION_BUTTON_WIDTH_PX }}
            className={`${ACTION_BUTTON_CLASS_NAME} bg-danger`}
          >
            删除
          </button>
        </div>

        <div
          data-testid="conversation-row-drag-surface"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{
            transform: `translateX(${translateX}px)`,
            transition: dragX === null ? "transform 200ms ease-out" : "none",
            touchAction: "pan-y"
          }}
          className="relative bg-card"
        >
          <Link
            to={`/messages/${conversation.id}`}
            data-testid="conversation-link"
            onClick={handleRowLinkClick}
            className="flex items-center gap-3 px-4 py-3"
          >
            {avatarElement}
            <div className="min-w-0 flex-1">
              <span className={nicknameClassName}>{nickname}</span>
              {conversation.postTitle ? (
                <span className="mt-0.5 block truncate text-xs text-text-muted">
                  关于：{conversation.postTitle}
                </span>
              ) : null}
              {conversation.lastMessagePreview ? (
                <span data-testid="conversation-preview" className={previewClassName}>
                  {conversation.lastMessagePreview}
                </span>
              ) : null}
              <span className="mt-0.5 block text-xs text-text-muted">
                {formatPublishedAt(conversation.lastActivityAt)}
              </span>
            </div>
            {effectiveIsUnread ? (
              <span
                aria-hidden="true"
                data-testid="unread-dot"
                className="h-2 w-2 shrink-0 rounded-full bg-danger"
              />
            ) : null}
          </Link>
        </div>
      </div>
      {blockError ? (
        <p role="alert" className="px-4 py-2 text-xs text-danger">
          {blockError}
        </p>
      ) : null}
    </li>
  );
}
