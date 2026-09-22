import { useQueryClient } from "@tanstack/react-query";
import { Bell, Headset, ImagePlus, Megaphone } from "lucide-react";
import { Fragment, type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { ImageLightbox } from "../../components/image-lightbox";
import { useBlockUserMutation } from "../../features/blocks/use-block-user-mutation";
import { useIsBlockedPairQuery } from "../../features/blocks/use-is-blocked-pair-query";
import { useIsBlockingQuery } from "../../features/blocks/use-is-blocking-query";
import { useUnblockUserMutation } from "../../features/blocks/use-unblock-user-mutation";
import { useMyConversationsQuery } from "../../features/conversations/use-my-conversations-query";
import { useMessagesQuery } from "../../features/messages/use-messages-query";
import { useSendMessageMutation } from "../../features/messages/use-send-message-mutation";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { markConversationAsRead } from "../../repositories/conversations-repository";
import type { NotificationPayload } from "../../repositories/messages-repository";
import { messageImageStorageService } from "../../services/storage/message-image-storage-service";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { formatMessageTimeDivider, shouldShowMessageTimeDivider } from "../../utils/format";

const MESSAGE_MAX_LENGTH = 5000;
const EMPTY_MESSAGE_ERROR = "请输入文字或选一张图片再发送。";
const MESSAGE_TOO_LONG_ERROR = `消息内容不能超过 ${MESSAGE_MAX_LENGTH} 字。`;
const DEFAULT_ERROR_MESSAGE = "发送失败，请稍后重试。";
const SESSION_EXPIRED_MESSAGE = "登录状态已失效，请重新登录后再发送消息。";
const EMPTY_CONVERSATION_MESSAGE = "还没有消息，发一条打个招呼吧。";
const LOAD_ERROR_MESSAGE = "消息加载失败，请刷新页面重试。";
const DEFAULT_OTHER_PARTY_LABEL = "对方";
const SYSTEM_NOTIFICATION_LABEL = "Saminest 通知";
const SYSTEM_NOTIFICATION_SUBTITLE = "官方通知";
// 把"联系客服"拆成独立会话类型任务卡：support 会话的 header 标题/副标题，
// 跟 SYSTEM_NOTIFICATION_LABEL/SYSTEM_NOTIFICATION_SUBTITLE 是两组独立的
// 文案——support 会话是真正的客服聊天（拼多多"意见反馈"那种干净聊天界面），
// 不是系统通知，标题不用"Saminest 通知"这种自动通知的措辞。这个项目没有
// 电话客服，副标题不照抄参考截图里的客服热线号码格式。
const SUPPORT_CONVERSATION_LABEL = "客服";
const SUPPORT_CONVERSATION_SUBTITLE = "我们会尽快回复";
const BLOCK_ACTION_ERROR_MESSAGE = "操作失败，请稍后重试。";
const BLOCKED_COMPOSER_MESSAGE = "你们之间存在屏蔽关系，无法互发消息。";
// 联系客服改成真聊天任务卡：管理员回复（sender_id 为 null 但
// notification_payload 也为 null，不是结构化通知卡片）在聊天气泡旁边
// 显示的发送者标签，跟 SYSTEM_NOTIFICATION_LABEL（🔔通知卡片专用）是
// 两回事，不要混用。
const ADMIN_REPLY_SENDER_LABEL = "官方客服";
const IMAGE_UPLOAD_ERROR_MESSAGE = "图片发送失败，请稍后重试。";
const ACCEPTED_MESSAGE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MESSAGE_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_MESSAGE_IMAGE_SIZE_MB = MAX_MESSAGE_IMAGE_SIZE_BYTES / (1024 * 1024);

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
 *
 * 联系客服改成真聊天任务卡：这里加了 export——管理员后台的客服会话详情
 * 页（admin-support-conversation-page.tsx）需要渲染用户真实头像/首字母
 * 占位，跟这个页面是同一套展示逻辑，直接复用，不重写一份。
 */
export function Avatar({ avatarUrl, initial, sizeClassName, testId }: AvatarProps) {
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

export interface SystemNotificationCardProps {
  payload: NotificationPayload;
  createdAt: string;
}

/**
 * 系统通知消息（message.senderId === null）的卡片渲染——不走聊天气泡那套
 * "isMine 左右 + 头像/占位对齐"逻辑，图标 + 标题（加粗）+ 摘要（小字）+
 * 时间，整张卡片占满可用宽度（不是 75% 那种气泡宽度）。有 link 时整张
 * 卡片是一个 <Link>，点击跳转；没有 link 就是纯展示，不可点——用
 * `payload.link != null` 判断，跟 null/undefined 都不算"有链接"。
 *
 * 联系客服改成真聊天任务卡：这里加了 export，理由跟 Avatar 一样——管理员
 * 后台的客服会话详情页也需要展示同一条会话里穿插的系统通知消息（比如
 * "帖子审核通过"），用同一个组件保持视觉一致，不重新实现一份。
 */
export function SystemNotificationCard({ payload, createdAt }: SystemNotificationCardProps) {
  const content = (
    <div className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3">
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
 * 任务卡 4（发起人群发通知参与者）新增——activity_notify_participants()
 * 写的这类消息虽然也满足 notificationPayload !== null（复用
 * SystemNotificationCard 判断"要不要走卡片而不是气泡"的同一个条件，见
 * isSystemMessage 的用法），但语义上不是"Saminest 官方系统通知"（不是
 * origin_type = 'system' 那种只有接收者一个成员的专属会话，这条消息就在
 * 发起人和这个参与者原本的 1:1 会话里），所以不复用 SystemNotificationCard
 * 那个组件（不改它，见文件顶部函数级注释），单独加一个视觉上能区分开的
 * 卡片：图标换成 Megaphone（📢），不是 Bell（🔔）。结构（图标+标题+摘要+
 * 时间、有 link 整张卡可点）跟 SystemNotificationCard 完全一致，是刻意
 * 保持的一致性，不是重复造轮子——两种通知卡片在这个会话页里应该有同一套
 * "占满宽度、不是聊天气泡"的基础排版，只是图标不一样。
 */
function ActivityNotificationCard({ payload, createdAt }: SystemNotificationCardProps) {
  const content = (
    <div className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3">
      <div
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
      >
        <Megaphone size={16} />
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
 * 消息列表里的头像左右两侧都会显示，每一条消息各自带一个头像，不做
 * "连续同一发送者只在第一条显示"那种分组（28 号卡起，见下面单独一段
 * 说明这条规则的调整过程）。对方头像来源是 conversation?.otherAvatarUrl
 * （会话级别取一次，不是每条消息单独查），因为一个会话里"对方"只有一个
 * 人。
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
 *   message.notificationPayload !== null）的消息不走气泡+头像那套逻辑，
 *   单独渲染成 SystemNotificationCard——isSystemMessage 这个判断把它们
 *   显式挡在气泡渲染分支之外，不会被误判成"对方发的普通消息"进而套用
 *   头像逻辑。
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
 *
 * 28 号卡（私信消息气泡头像显示）：
 *
 * 28.1 调查结论（先读代码，不要假设）：
 * 1. "XX申请加入你的活动《XXX》"/"XX报名了你的活动《XXX》"这类消息，读
 *    use-toggle-activity-participation-mutation.ts 的 notifyOrganizer()
 *    确认：发送方式是普通的 sendMessage({ senderId: 真实用户 id, body })，
 *    跟手打一条文字消息完全一样——sendMessage() 本身从来不写
 *    notification_payload 列（只有 conversation_id/sender_id/body 三个
 *    字段），所以这类消息的 notificationPayload 恒为 null、senderId 是
 *    真实用户，不满足 isSystemMessage 的判断条件。也就是说它们**不是**
 *    真正的系统通知消息（那种 senderId 为 null、渲染成 SystemNotificationCard
 *    的），只是文案读起来像通知——本来就该走跟普通文字消息完全一样的气泡+
 *    头像逻辑，代码里没有任何条件判断会专门排除或隐藏它们的头像。这一点
 *    我在本地起了真实环境（本地 Supabase）复现过一遍：建一个活动、另一个
 *    账号报名，回到发起人这边打开会话，"XX 报名了你的活动《XXX》"这条
 *    消息旁边确实正常显示了对方头像（首字母占位，因为项目还没有头像上传
 *    功能）。综合代码 + 实测结论：**这不是一个能复现的 bug**，反馈里描述
 *    的现象在当前 main 上找不到对应的缺陷——最可能的解释是反馈来自还没
 *    同步到这几次头像/会话相关改动的旧版本（跟 15 号卡"快乐小狗"那次的
 *    结论是同一类情况）。既然找不到真实的头像缺失，这次就没有针对"系统
 *    通知样式消息缺头像"这条单独加代码修复——28.2 之所以仍然改了这个
 *    文件，是因为下面第 2 点"我方消息完全没有头像"确实是真的。
 * 2. 我方发送的消息（isMine === true）：改版前 JSX 里 `{!isMine ? (...)
 *    : null}` 这一整段头像/占位判断只在 !isMine 分支里，isMine 为 true
 *    时这段代码完全不会执行——不是数据没传到位，也不是被样式隐藏，是
 *    压根没写这段渲染逻辑。确认是"当初的设计里自己发的消息本来就不带
 *    头像"，不是遗漏的 bug，这次是新增这个之前没有的展示。
 * 3. 连续同一发送者分组：改版前的 isConsecutiveFromSameSender 判断已经
 *    存在，但只用在对方消息这一侧（`!isMine && ...`）——同一人连续发的
 *    消息只在第一条旁边显示头像，中间用等宽空 div 占位。28.2 最初一版
 *    给我方消息加头像时，直接把这套现成规则去掉 `!isMine` 限制、对双方
 *    对称复用；用户反馈明确要求改成"不分组，双方每条消息都各自带一个
 *    头像"，于是这版把 isConsecutiveFromSameSender 这整个判断连同两侧的
 *    spacer 占位 div 都删掉了——头像变成只看 isMine 一个条件就无条件渲染，
 *    不再看上一条消息是谁发的。
 * 4. 深色模式：搜了整个仓库（index.css + src 下所有文件），这个项目目前
 *    **没有任何深色模式/主题切换的实现**——没有 prefers-color-scheme、
 *    没有 data-theme、没有 Tailwind dark: 前缀类，也没有任何主题相关的
 *    store/hook。反馈里"第二张截图是深色主题"大概率是手机系统级的强制
 *    深色（比如 Android WebView 的"强制深色"辅助功能，会自动反色网页），
 *    不是这个应用自己实现、能控制的主题。这次头像沿用现有 Avatar 组件
 *    原有的 token 类名（bg-primary/10 text-primary，跟这个页面所有其它
 *    头像完全一致），没有另外加深色样式——这个应用现在没有"深色模式"这个
 *    概念可以挂靠，加 dark: 类不会有任何实际效果。如果之后要做真正的
 *    深色模式，是一张独立的、范围大得多的任务卡，不是这次头像展示能顺带
 *    解决的。
 *
 * 28.2 实现：我方消息气泡加了右侧头像（数据源 useMyProfileQuery()，跟
 * "我的"页读的是同一个 hook/同一个 queryKey，没有新写一个查询），跟对方
 * 头像共用同一个 Avatar 组件、同一个尺寸（原来是 h-7 w-7=28px，后来的
 * 任务卡"聊天页头像字体太小"改成了 h-9 w-9=36px，见 <li> 内 Avatar 调用
 * 处的注释）；气泡所在 <li> 的 flex 布局从"仅对方侧
 * items-start justify-start gap-2 / 我方侧单纯 justify-end"统一成两侧
 * 都是 items-start + gap（原来是 gap-2，后来放大头像/字号时微调成
 * gap-2.5），只是 justify-end/justify-start 决定头像在右边还是左边、
 * DOM 顺序也对调（我方：气泡在前、头像在后；对方：头像在前、气泡在后），
 * 视觉上左右对称。每条消息各自
 * 渲染自己的头像（不分组、没有 spacer 占位，见上面第 3 点），两侧的
 * data-testid 分别是 message-avatar（对方）/message-avatar-self（我方）。
 *
 * 30 号卡（打通"活动申请通知"到审核页面的跳转，方案 A）：
 * "XX 申请加入你的活动《XXX》，去处理一下吧"这条消息（notifyOrganizer()
 * 在 requiresApproval 为 true 时发的那一条）现在带着 ref_activity_id，
 * 会话页据此在气泡下面加一行"查看申请 →"链接，跳到
 * `/my-activities?pendingActivityId=<活动id>`（见 my-activities-page.tsx
 * 怎么用这个查询参数自动展开+滚动到对应审核面板）。方案 A 明确要求"不改
 * 消息形式"——这条消息本身仍然是 sender_id 为真实用户的普通消息，不是
 * senderId 为 null 的系统通知，气泡样式（bg-primary/bg-card 的聊天泡）
 * 完全不变，双方仍然可以在这条会话里继续互相发消息；"查看申请 →"只是
 * 气泡下面单独多一行，不是把整条消息换成 SystemNotificationCard 那种
 * 卡片。链接只在 !isMine（收到这条消息的一方，也就是发起人自己）这一侧
 * 渲染——发这条消息的申请人看到自己发出去的这条消息时不需要这个入口，
 * 他不是这场活动的发起人。"报名了"/"退出了"这两种消息的 ref_activity_id
 * 保持 null（不需要审核的报名、或者退出，没有"查看申请"这回事），不会
 * 出现这行链接，判断依据就是 message.refActivityId 这一列本身有没有值，
 * 不解析 body 文本内容找活动。
 *
 * 联系客服改成真聊天任务卡（历史改动，第 1 点已经被下面"把联系客服拆成
 * 独立会话类型任务卡"取代，保留原文只是为了留下改动脉络，不代表当前
 * 行为）："联系客服"从填一次性表单（/feedback）改成打开/新建自己的
 * origin_type = 'system' 会话，这个页面因此要能支撑"system 会话也是一
 * 个真正能双向聊天的会话"：
 *
 * 1.（已被取代，见下面新任务卡的说明）输入框（`<form
 *    data-testid="conversation-composer">`）和"屏蔽关系"横幅原来都额外
 *    要求 `!isSystemConversation` 才渲染——之前的 system 会话是纯单向
 *    通知，"没有人会收到回复，不应该让用户以为可以对系统说话"这条前提
 *    这次变了，system 会话现在可以双向聊天，这两处的
 *    `!isSystemConversation` 判断都去掉了。屏蔽关系本身依然不适用于
 *    system 会话（没有"对方"），但不需要专门再判断一次——system 会话
 *    的 otherUserId 恒为 undefined，useIsBlockedPairQuery 因此恒为
 *    禁用查询（isBlockedPair 恒为 falsy 的 undefined），`!isBlockedPair`
 *    对 system 会话自然成立，composer 会正常显示。
 * 2. 消息分类新增第三种：`sender_id` 为 null 但 `notification_payload`
 *    也为 null 的消息（isSystemMessage 已经是 false，不会被误判成
 *    通知卡片）——这是 admin_reply_to_support_conversation() 插入的
 *    客服聊天回复，isAdminReply 这个派生布尔值标记它，渲染上仍然走
 *    "对方"气泡这条既有分支（isMine 天然是 false），只是头像换成
 *    Headset 图标（区别于 header 的 Bell，避免用户把"人工客服在回复"
 *    误认成"又一条自动通知"），气泡上方加一行"官方客服"标签。
 * 3. 输入框旁边新增"添加图片"入口（ImagePlus 图标，label 包一个隐藏
 *    input，照抄 feedback-image-picker.tsx 的模式），选中的图片先本地
 *    预览，点"发送"时才用 messageImageStorageService 压缩+上传到私有的
 *    message-images 桶，拿到 Storage 路径后随消息一起插入（body/图片
 *    至少一个非空，两个都可以有，数据库层 messages_body_or_image_check
 *    兜底）。消息气泡里如果有图片，缩略图显示在文字上面，点击用现成的
 *    ImageLightbox 组件（帖子详情页图片查看器）打开大图，不新写一个
 *    查看器。上传失败、或者上传成功但插入消息失败，分别有各自的错误
 *    处理（后者会尝试补偿删除已经传上去的孤儿图片，失败只
 *    console.error，不盖过发送失败这个更重要的提示），见 handleSubmit
 *    的注释。
 *
 * 把"联系客服"拆成独立会话类型任务卡（这次改动）："联系客服"和"系统
 * 通知"这次彻底拆成两种独立的会话类型——origin_type = 'system' 只保留
 * 纯单向自动通知（不再承载双向聊天），origin_type = 'support' 是全新
 * 类型，专门给"联系客服"用（第一次创建时数据库函数自动插入一条客服
 * 欢迎语，见 get_or_create_own_support_conversation() 迁移文件）：
 *
 * 1. header 新增 isSupportConversation 分支，跟 isSystemConversation
 *    是并列的三选一（system / support / 其它）——头像换 Headset 图标，
 *    标题固定"客服"，副标题"我们会尽快回复"，不复用"Saminest 通知"那套
 *    文案（那是系统通知专属，语义上不是客服聊天）。
 * 2. composer（`<form data-testid="conversation-composer">`）重新加回了
 *    `!isSystemConversation` 这个条件——上面第 1 点"历史改动"里去掉的
 *    这个判断，这次原样加回来了：双向聊天已经整个搬到 support 会话，
 *    system 会话没有理由再显示一个没有人会回复的输入框。isSupportConversation
 *    不需要额外判断——它天然不是 isSystemConversation，
 *    !isSystemConversation 对它恒为 true，输入框正常显示。"屏蔽关系"
 *    横幅这次没有变化，一直保留着 !isSystemConversation 这个判断（历史
 *    改动那次没有动过它）。
 * 3. 消息渲染分支完全不用改——support 会话的欢迎语和管理员后续的聊天
 *    回复，都是 sender_id = null、notification_payload = null 这同一种
 *    消息形状，天然满足既有的 isAdminReply 判断（`!isSystemMessage &&
 *    message.senderId === null`），自动套用"Headset 头像 + 官方客服
 *    标签 + 对方气泡"这套已有渲染。
 * 4. canManageBlock（`!isSystemConversation && !!otherUserId`）不用改——
 *    support 会话的 otherUserId 天然是 undefined（跟 system 会话一样，
 *    没有"对方"这个成员），`!!otherUserId` 自然是 false，退回原来那个
 *    禁用占位按钮，不需要新增 isSupportConversation 判断。这一点已经
 *    在本地实际起了一条 support 会话验证过"…"菜单确实退回禁用占位状态，
 *    不是只凭这段推理假设。
 *
 * Avatar / SystemNotificationCard 这两个组件加了 export——管理员后台新增
 * 的客服会话详情页（admin-support-conversation-page.tsx）复用它们渲染
 * 用户头像和穿插在对话里的系统通知消息，不重新实现一份视觉上本该一致
 * 的东西。那个页面不是这个组件的另一个变体/参数化分支——管理员视角的
 * "我方/对方"跟这里刚好相反（客服自己的回复才是"我方"），header 也完全
 * 不需要屏蔽菜单/对方主页链接这些用户视角特有的东西，独立成一个页面
 * 更清楚，不硬塞进这个文件用一堆 isAdminView 分支参数化。
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
  const { data: myProfile } = useMyProfileQuery();

  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 联系客服改成真聊天任务卡：一次只能带一张图（不做多图消息），选好之后
  // 先本地预览，真正的压缩+上传延迟到点"发送"那一刻才做——跟
  // feedback-image-picker.tsx"选择/校验/预览"和"上传"分属两个不同阶段是
  // 同一个模式，只是这里只有一张图，不需要一个数组。
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  // 点开的图片（聊天气泡里的缩略图或者对方/管理员发来的图）大图预览，
  // 复用现成的 ImageLightbox 组件（帖子详情页图片查看器），null 表示
  // 没有打开。
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const conversation = conversations?.find((item) => item.id === conversationId);
  const isSystemConversation = conversation?.originType === "system";
  // 把"联系客服"拆成独立会话类型任务卡新增：support 会话是独立于
  // system 会话的第三种 header 分支——顶栏固定显示"客服"，不是"Saminest
  // 通知"，见上面两个新常量的注释。
  const isSupportConversation = conversation?.originType === "support";
  const otherPartyLabel = isSystemConversation
    ? SYSTEM_NOTIFICATION_LABEL
    : isSupportConversation
      ? SUPPORT_CONVERSATION_LABEL
      : conversation?.otherDisplayName ?? DEFAULT_OTHER_PARTY_LABEL;
  const conversationContext = isSystemConversation
    ? SYSTEM_NOTIFICATION_SUBTITLE
    : isSupportConversation
      ? SUPPORT_CONVERSATION_SUBTITLE
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
  // 聊天页滚动定位：消息列表容器（<section data-testid="conversation-
  // messages">）之前没有任何滚动定位逻辑，进入一个消息较多的会话时停在
  // 浏览器给的默认位置（观察到的是顶部/上次缓存位置），不是最新消息，
  // 需要手动下滑。这个仓库没有 Realtime、消息列表只在首次加载和自己发
  // 消息成功后才会变化（见 use-send-message-mutation.ts 的 invalidate），
  // 不存在"对方消息实时推进、持续把用户拉回底部打扰阅读历史"这种更复杂的
  // 场景，所以只需要在 messageList 变化时无条件把容器滚到底部一次，不需要
  // 判断"用户是否正停留在底部附近"。
  const messagesContainerRef = useRef<HTMLElement | null>(null);

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

  // 每次选中的图片变化时重新生成预览地址，下一次变化/卸载时撤销上一个，
  // 避免 URL.createObjectURL 造成的内存泄漏——照抄
  // feedback-image-picker.tsx 同一段逻辑，这里只有一张图，不需要数组。
  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  function handleImageInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    // 允许再次选中同一个文件也能触发 change 事件。
    event.target.value = "";
    if (!file) return;

    setImageError(null);
    if (!ACCEPTED_MESSAGE_IMAGE_MIME_TYPES.includes(file.type)) {
      setImageError("只支持 JPEG、PNG 或 WEBP 格式的图片。");
      return;
    }
    if (file.size === 0) {
      setImageError("文件是空的，无法上传。");
      return;
    }
    if (file.size > MAX_MESSAGE_IMAGE_SIZE_BYTES) {
      setImageError(`文件大小不能超过 ${MAX_MESSAGE_IMAGE_SIZE_MB}MB。`);
      return;
    }
    setImageFile(file);
  }

  function handleRemoveImage(): void {
    setImageFile(null);
    setImageError(null);
  }

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
    if (sendMessageMutation.isPending || isUploadingImage) return;

    setValidationError(null);
    setSubmitError(null);

    const senderId = currentUserId;
    if (!senderId) {
      setSubmitError(SESSION_EXPIRED_MESSAGE);
      return;
    }

    const trimmedBody = body.trim();
    // 联系客服改成真聊天任务卡：文字和图片可以只有其中一个，但不能两个
    // 都没有——只有"两者都为空"才提示错误，不再要求文字必填。
    if (!trimmedBody && !imageFile) {
      setValidationError(EMPTY_MESSAGE_ERROR);
      return;
    }
    if (trimmedBody.length > MESSAGE_MAX_LENGTH) {
      setValidationError(MESSAGE_TOO_LONG_ERROR);
      return;
    }

    // 先压缩+上传图片（如果选了的话），拿到 Storage 路径之后再发消息——
    // 跟 submit-feedback-page.tsx"先传图、再插入数据库行"是同一个顺序。
    // 上传失败直接展示错误、不继续发消息，避免出现"消息发出去了，但图片
    // 没传上去"这种半成品状态。
    let imagePath: string | undefined;
    if (imageFile) {
      setIsUploadingImage(true);
      try {
        const result = await messageImageStorageService.uploadMessageImage({
          file: imageFile,
          conversationId: conversationId ?? ""
        });
        imagePath = result.imagePath;
      } catch {
        setIsUploadingImage(false);
        setSubmitError(IMAGE_UPLOAD_ERROR_MESSAGE);
        return;
      }
      setIsUploadingImage(false);
    }

    try {
      await sendMessageMutation.mutateAsync({
        senderId,
        body: trimmedBody || undefined,
        imagePath
      });
      setBody("");
      handleRemoveImage();
    } catch (error) {
      // 图片已经传到 Storage、但这条消息插进数据库失败——补偿清理这个
      // 孤儿文件，跟 feedback-image-storage-service.ts 的
      // removeFeedbackImageFiles 是同一个模式：清理失败只 console.error，
      // 不能让"清理失败"盖过原本更重要的"发送失败"提示。
      if (imagePath) {
        messageImageStorageService.removeMessageImageFile(imagePath).catch((cleanupError) => {
          console.error("清理发送失败后残留的聊天图片失败：", cleanupError);
        });
      }
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

  // 首次进入会话、消息加载完成时，以及自己发送新消息成功、列表因为
  // invalidate 重新拉取之后，都会命中这个 effect（messageList 的引用/
  // 长度会变）——直接把 scrollTop 设成 scrollHeight，不需要平滑动画，
  // 参考大多数聊天 App 打开会话时的观感。conversationId 也放进依赖数组：
  // 如果以后从一个会话直接切换到另一个会话（路由参数变了但组件没有被
  // 卸载重建），确保切换后同样会重新定位到新会话的最新消息，不依赖组件
  // 重新挂载这个前提。
  useEffect(() => {
    if (messagesPending || messageList.length === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [conversationId, messagesPending, messageList.length]);

  // 联系客服改成真聊天任务卡：只要有文字或者有图片就能发，两者都为空才
  // 禁用——不再要求文字必填。
  const hasComposerContent = body.trim().length > 0 || imageFile !== null;
  const sendDisabled = sendMessageMutation.isPending || isUploadingImage || !hasComposerContent;
  // 28 号卡：我方消息气泡右侧头像的昵称首字母兜底——跟 otherPartyLabel
  // 用同一个"取首字母"规则（见 profile-summary.tsx 的 avatarInitial），
  // 没有昵称时兜底"我"而不是"?"，因为这里确定就是当前登录用户自己，不是
  // 一个身份不明的占位对象。
  const myInitial = myProfile?.displayName?.trim().charAt(0).toUpperCase() || "我";
  const headerAvatarElement = isSystemConversation ? (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
    >
      <Bell size={18} />
    </div>
  ) : isSupportConversation ? (
    // 把"联系客服"拆成独立会话类型任务卡：support 会话的 header 头像换成
    // Headset 图标（跟聊天气泡里管理员回复用的是同一个图标，视觉一致），
    // 不是 Bell——用户一眼就能看出这是"人工客服"而不是"自动通知"。
    <div
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
    >
      <Headset size={18} />
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
      <header className="grid h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center border-b border-border bg-card px-2">
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
                className="absolute right-0 top-11 z-20 min-w-[132px] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
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
        ref={messagesContainerRef}
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
              // 联系客服改成真聊天任务卡新增：sender_id 为 null 但
              // notification_payload 也为 null 的消息——不是结构化系统
              // 通知卡片（isSystemMessage 已经是 false），是
              // admin_reply_to_support_conversation() 插入的客服聊天
              // 回复。isMine 对这种消息天然是 false（null 不等于任何
              // currentUserId），会正常落进下面的"对方"气泡分支，这里
              // 只是额外标记一下，好换成"官方客服"的头像/标签，不需要
              // 单独开一个新的渲染分支。
              const isAdminReply = !isSystemMessage && message.senderId === null;
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
                      aria-label={
                        message.notificationPayload?.kind === "activity_broadcast"
                          ? "活动通知"
                          : "系统通知"
                      }
                      className="flex justify-center"
                    >
                      {/* 任务卡 4：只新增这一层判断，isSystemMessage 本身
                          和下面的普通气泡分支（else 那一侧）都没有改动。 */}
                      {message.notificationPayload?.kind === "activity_broadcast" ? (
                        <ActivityNotificationCard
                          payload={message.notificationPayload as NotificationPayload}
                          createdAt={message.createdAt}
                        />
                      ) : (
                        <SystemNotificationCard
                          payload={message.notificationPayload as NotificationPayload}
                          createdAt={message.createdAt}
                        />
                      )}
                    </li>
                  ) : (
                    <li
                      data-message-owner={isMine ? "self" : "other"}
                      aria-label={isMine ? "我发送的消息" : "对方发送的消息"}
                      className={`flex items-start gap-2.5 ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      {/* 聊天页头像/字体放大（对齐小红书私信界面的尺寸感）：
                          头像从 h-7 w-7（28px）放大到 h-9 w-9（36px），
                          气泡文字从 text-sm（14px）放大到 text-base
                          （16px，项目正文标准字号，见 index.css 顶部
                          "Body 正文...text-base"这条约定），气泡内边距
                          跟着从 px-3 py-2 放大到 px-3.5 py-2.5 配合更大的
                          字号，外层 gap 从 gap-2 微调到 gap-2.5——放大后
                          头像和气泡之间的间距如果还是 8px 显得略挤，加大
                          2px 更协调，数值以实际截图观感为准。 */}
                      {!isMine ? (
                        isAdminReply ? (
                          // 联系客服改成真聊天任务卡：客服回复不是任何
                          // 真实用户，没有头像可用，跟 header 的系统
                          // 会话图标（Bell）区分开——这里用 Headset
                          // 图标，视觉上表达"人工客服"而不是"系统通知"。
                          <div
                            aria-hidden="true"
                            data-testid="message-avatar"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-text-muted"
                          >
                            <Headset size={18} />
                          </div>
                        ) : (
                          <Avatar
                            avatarUrl={conversation?.otherAvatarUrl ?? null}
                            initial={otherPartyLabel.charAt(0)}
                            sizeClassName="h-9 w-9"
                            testId="message-avatar"
                          />
                        )
                      ) : null}
                      <div className={`flex min-w-0 max-w-[75%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                        {/* 联系客服改成真聊天任务卡：客服回复的气泡上面
                            加一行"官方客服"标签——系统会话的 header 固定
                            显示"Saminest 通知"，如果不额外标注，用户没法
                            从气泡本身分清"这是自动通知"还是"真人客服在
                            回复"。 */}
                        {isAdminReply ? (
                          <span className="mb-1 text-xs font-medium text-text-muted">
                            {ADMIN_REPLY_SENDER_LABEL}
                          </span>
                        ) : null}
                        {/* 联系客服改成真聊天任务卡：图片缩略图放在文字
                            气泡上面（跟大多数聊天 App 的排布一致），点击
                            用 ImageLightbox 打开大图；body 为空（纯图片
                            消息）时不渲染下面的文字气泡。 */}
                        {message.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightboxImageUrl(message.imageUrl)}
                            className="mb-1 block overflow-hidden rounded-2xl"
                          >
                            <img
                              src={message.imageUrl}
                              alt=""
                              className="h-40 w-40 object-cover"
                            />
                          </button>
                        ) : null}
                        {/* 全 App 视觉 Token 体系（第二批）：现状核实过——
                            自己发的气泡已经是 bg-primary + text-white，
                            完全符合 BARRY 方案，没有改；对方气泡原来是
                            bg-card + text-text，但没有边框，这次页面
                            背景（<main> 的 bg-bg）是浅灰蓝，白色气泡贴着
                            灰背景没有边界会糊在一起——补上
                            border border-border，让气泡边界跟背景拉开，
                            对应 BARRY 方案"对方消息气泡 = bg-card 底 +
                            border-border 边框 + text-text 深字"这条。
                            联系客服改成真聊天任务卡：body 现在可能为
                            null（纯图片消息），这一整块改成条件渲染，
                            不再无条件展示一个空气泡。 */}
                        {message.body ? (
                          <div
                            className={
                              isMine
                                ? "min-w-0 whitespace-pre-wrap rounded-2xl bg-primary px-3.5 py-2.5 text-base text-white [overflow-wrap:anywhere]"
                                : "min-w-0 whitespace-pre-wrap rounded-2xl border border-border bg-card px-3.5 py-2.5 text-base text-text [overflow-wrap:anywhere]"
                            }
                          >
                            {message.body}
                          </div>
                        ) : null}
                        {/* 30 号卡：只有"申请加入（需要审核）"这条通知消息带
                            ref_activity_id（见 notifyOrganizer() 的注释），
                            只在收到方（!isMine，也就是发起人自己）这一侧
                            渲染这个跳转链接——发这条消息的申请人自己看到
                            自己发的这条消息时不需要、也不该有这个入口，
                            他不是这场活动的发起人，点了也找不到对应的
                            审核面板。气泡样式完全不变（方案 A 明确要求
                            不换成系统通知卡片，双方仍然是普通聊天气泡，
                            这个链接只是气泡下面单独一行，不影响气泡本身）。 */}
                        {!isMine && message.refActivityId ? (
                          <Link
                            to={`/my-activities?pendingActivityId=${message.refActivityId}`}
                            className="mt-1 text-xs font-medium text-primary hover:underline"
                          >
                            查看申请 →
                          </Link>
                        ) : null}
                      </div>
                      {/* 28 号卡（改版后）：我方消息气泡右侧头像，跟左侧对方
                          头像对称——同一套 Avatar 组件、同一个尺寸，数据源
                          换成 myProfile/myInitial（当前登录用户自己）。 */}
                      {isMine ? (
                        <Avatar
                          avatarUrl={myProfile?.avatarUrl ?? null}
                          initial={myInitial}
                          sizeClassName="h-9 w-9"
                          testId="message-avatar-self"
                        />
                      ) : null}
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* 把"联系客服"拆成独立会话类型任务卡：composer 这次重新加回了
          !isSystemConversation 这个条件——"联系客服改成真聊天"那张任务卡
          曾经把这个条件去掉过（当时 system 会话本身承载双向聊天），但这
          次拆分之后双向聊天已经整个搬到新的 support 会话，system 会话
          重新变回纯单向自动通知，没有人会去回复它，不应该再显示一个看起
          来能发消息、实际上没有客服会看的输入框。support 会话不需要
          额外判断——它天然不是 isSystemConversation，
          !isSystemConversation 对它恒为 true，输入框正常显示，只看
          !isBlockedPair 这一个条件（support 会话跟 system 会话一样没有
          "对方"，otherUserId 恒为 undefined，useIsBlockedPairQuery 因此
          恒为禁用查询，!isBlockedPair 天然为 true）。"屏蔽关系"横幅继续
          保留 !isSystemConversation 这个判断——屏蔽这个概念对 system/
          support 会话本来就没有意义（都没有"对方"可以屏蔽），哪怕
          isBlockedPair 因为某种异常变成了 true，也不应该展示一条"你们
          之间存在屏蔽关系"这种在这两类会话里完全说不通的文案；这种异常
          情况下 composer 依然会因为 isBlockedPair 为 true 被下面的条件
          挡住，只是不显示这条不适用的横幅去"解释"，这是刻意的取舍，不是
          遗漏。 */}
      {!isSystemConversation && isBlockedPair ? (
        <div
          data-testid="conversation-blocked-banner"
          className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-card px-4 py-3 text-center text-sm text-text-muted"
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
          className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-2 border-t border-border bg-card px-4 pt-3"
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
          {imageError ? (
            <p role="alert" className="rounded-xl border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
              {imageError}
            </p>
          ) : null}
          {/* 联系客服改成真聊天任务卡：选好图片之后的本地预览，带一个
              移除按钮——发送成功/取消都会清空，见 handleSubmit /
              handleRemoveImage。 */}
          {imagePreviewUrl ? (
            <div className="relative w-fit">
              <img
                src={imagePreviewUrl}
                alt=""
                className="h-16 w-16 rounded-xl object-cover"
              />
              <button
                type="button"
                aria-label="移除图片"
                onClick={handleRemoveImage}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              >
                ×
              </button>
            </div>
          ) : null}
          {/* 全 App 视觉 Token 体系（第二批）：输入框 focus 态跟其它表单
              统一换成柔光（focus:ring-4 focus:ring-primary-light），
              bg-bg 这个底色是刻意保留的——输入框陷在白色 bg-card 工具栏
              里、用页面背景色做"凹陷"视觉区分，是既有的合理设计，不是
              占位/空状态场景，不套用 bg-surface-muted。发送按钮圆角从
              rounded-xl（12px）换成新的 rounded-button（14px）——这是
              矩形主 CTA，不是圆形/胶囊按钮。 */}
          <div className="flex min-w-0 items-center gap-2">
            {/* 联系客服改成真聊天任务卡新增："添加图片"入口，照抄
                feedback-image-picker.tsx"可点击的 label 包一个隐藏
                input"这个模式，不用额外的 ref/click() 触发。aria-label
                直接放在 <input> 本身上，不是放在外层 <label> 上——外层
                <label> 没有可见文字（只有一个图标），如果只在 <label>
                上写 aria-label，那只是给这个 <label> 元素自己起了个
                可访问名字，不会传导成里面这个 <input> 的可访问名字，
                getByLabelText("添加图片") 会找不到它。 */}
            <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-text-muted hover:bg-bg">
              <ImagePlus size={20} aria-hidden="true" />
              <input
                type="file"
                aria-label="添加图片"
                accept={ACCEPTED_MESSAGE_IMAGE_MIME_TYPES.join(",")}
                onChange={handleImageInputChange}
                className="sr-only"
              />
            </label>
            <label className="min-w-0 flex-1">
              <span className="sr-only">消息内容</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={1}
                placeholder="输入消息"
                className="h-12 w-full resize-none overflow-y-auto rounded-2xl border border-border bg-bg px-4 py-3 text-base leading-6 text-text focus:outline-none focus:ring-4 focus:ring-primary-light"
              />
            </label>
            <button
              type="submit"
              disabled={sendDisabled}
              className="h-12 shrink-0 rounded-button bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploadingImage ? "上传中…" : sendMessageMutation.isPending ? "发送中…" : "发送"}
            </button>
          </div>
        </form>
      ) : null}

      {lightboxImageUrl ? (
        <ImageLightbox
          images={[lightboxImageUrl]}
          initialIndex={0}
          onClose={() => setLightboxImageUrl(null)}
        />
      ) : null}
    </main>
  );
}
