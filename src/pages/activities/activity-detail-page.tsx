import { Share } from "@capacitor/share";
import { Flag, Share2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ActivityFavoriteButton } from "../../components/activity-favorite-button";
import { ActivityParticipantAvatars } from "../../components/activity-participant-avatars";
import {
  ActivityParticipationButtonView,
  SECONDARY_BUTTON_CLASS_NAME
} from "../../components/activity-participation-button";
import { PersonCard } from "../../components/person-card";
import { TopBar } from "../../components/top-bar";
import { formatLocationDisplayName } from "../../data/us-states";
import { useActivityDetailQuery } from "../../features/activities/use-activity-detail-query";
import { useCreateActivityConversationMutation } from "../../features/activities/use-create-activity-conversation-mutation";
import { useActivityParticipantsQuery } from "../../features/activities/use-activity-participants-query";
import { useActivityParticipationAction } from "../../features/activities/use-activity-participation-action";
import type { ActivityDetail } from "../../repositories/activities-repository";
import { getActivityChannelMeta } from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import { formatActivityStartAt } from "../../utils/format";

const CONTACT_ORGANIZER_DEFAULT_ERROR_MESSAGE = "会话创建失败，请稍后重试。";

/**
 * 活动详情页（/activities/:id，公开，不需要登录，游客也能看，跟
 * post-detail-page.tsx 是同一个可见性模式：报名/退出这类操作需要登录，
 * 但查看详情本身不需要）。
 *
 * "活动不存在" / "当前身份看不到"（被取消、被软删除、或者压根不存在）
 * 统一渲染同一条文案，不做区分——理由跟 post-detail-page.tsx 完全一致：
 * 区分开来会向未授权的访问者泄露"这个 id 存在，只是被取消了"这种信息，
 * getActivityDetail 已经在 repository 层把这些情况收敛成同一个 null。
 *
 * 头像堆叠改版之后的页面顺序：标题 → 频道/标签（+发起人文字链接，跟改版
 * 前同一个位置）→ 头像堆叠（含参与人数文案）→ 时间 → 地点 → 描述 → 联系
 * 方式（若有）→ 发起人卡片 → "参加活动"按钮（独占一整行）。
 *
 * 04 号卡（find-buddy-flow）改版：顶部换成 TopBar 的 detail 变体（返回
 * 箭头 + "…"更多菜单），原来页面底部平铺的"收藏/分享/举报"操作行收进了
 * 这个更多菜单——ActivityFavoriteButton/handleShare/举报链接三个实现完全
 * 没变，只是从"页面正文里的一行"挪成了"菜单里的三项"，见下面 moreMenu
 * 的 content。TopBar 不认识"收藏/分享/举报"这些具体业务概念，调用方传
 * 什么就摆什么，见 top-bar.tsx 顶部注释。
 *
 * 发起人卡片这次加了一个右侧 chevron（纯装饰，不改变可点击范围——整张
 * 卡片本来就是一个 <Link>）：明确提示"这一整行可点，会跳发起者主页"，
 * 跟详情页/发起者主页之间的导航关系在视觉上对应起来。
 *
 * 23 号卡（帖子详情页顶部+操作区改版）：这张"发起人卡片"抽成了共享组件
 * `PersonCard`（见 person-card.tsx），帖子详情页新增的"发帖者卡片"复用
 * 同一个组件（传不同的 subtitle 文案），这里改成调用 `<PersonCard
 * userId={...} displayName={...} avatarUrl={...} subtitle="发起人" />`，
 * 不再是这个页面自己内联的一段 JSX——渲染结果跟改动前逐字节一致，唯一的
 * 例外是顺手修正了一个既有小 bug：原来 chevron 用的 `text-chev` 类名从来
 * 没有对应的 token（真正的 token 是 `text-chevron`），抽取时一并改成了
 * 正确的类名，chevron 颜色从"默认黑"变成设计要求的浅灰。
 *
 * 任务卡 4（发起人群发通知参与者）：新增 isOrganizer 判断（session.user.id
 * 是不是等于 data.organizerId，这个页面之前完全没有这层判断，之前只区分
 * "登录/未登录"决定报名按钮能不能点，不区分"是不是发起人"），只在为真时
 * 在参与者头像区块下方展示"📢通知参与者"链接，跳转独立路由
 * /activities/:id/notify（见 activity-notify-page.tsx）——这里只是入口，
 * 真正的权限强制在那个页面 + notify_activity_participants() 数据库函数
 * 那两层，不是靠这里隐藏链接就足够安全。
 *
 * 一致性的关键点：这个页面只调用一次 useActivityParticipationAction，把
 * 同一个 `participationAction` 对象分别交给 ActivityParticipationButtonView
 * （渲染"参加活动"按钮）和 ActivityParticipantAvatars 的
 * onTapEmptySlot/canTapEmptySlot（驱动头像堆叠里的空位点击）——两个入口
 * 背后是同一个 mutation 实例、同一份 disabled 判断，不是分别独立调用两次
 * hook 各自维护一套状态，见 activity-participation-button.tsx 顶部注释。
 *
 * 单栏列表页精简：原来的"参与者（N）"文字名单区块和"查看发起人"按钮都去
 * 掉了——完整名单现在只靠头像堆叠本身呈现（产品明确接受的取舍），发起人
 * 卡片本来就整条包在 <Link to="/users/:id"> 里，去掉旁边的"查看发起人"
 * 按钮之后它自然就是"点击进入发起人主页"的唯一入口，不需要额外补什么。
 * useActivityParticipantsQuery 这个查询本身没有删——ActivityParticipantAvatars
 * 仍然需要它的返回值渲染头像堆叠，只是不再额外渲染一份文字名单。社交资料页
 * 第一批留下的"发起人：{名字}"文字链接继续保留在原来的位置，跟发起人卡片
 * 指向同一个 /users/:id，允许重复，不需要去重（任务卡明确说明）。
 *
 * 任务卡 3（"联系发起人"按钮）：跟"参加活动"按钮并排放在同一行，样式复用
 * activity-participation-button.tsx 已导出的 SECONDARY_BUTTON_CLASS_NAME
 * （两个按钮各占半行——两者都套了一层 flex-1，PRIMARY/SECONDARY 各自的
 * `w-full` 类名负责撑满各自的半行，不需要改 ActivityParticipationButtonView
 * 本身）。点击行为整套照抄 contact-seller-button.tsx（未登录跳 /login、
 * 建会话中禁用按钮、ACCOUNT_RESTRICTED 单独文案、其它失败统一文案），但
 * 没有抽成一个新的共享组件——这次任务允许修改的文件列表明确只到
 * activity-detail-page.tsx 本身，所以逻辑直接写在这个页面组件里，不是
 * 遗漏了做成组件。调用的 useCreateActivityConversationMutation 内部包的
 * createActivityConversation() 是 conversations-repository.ts 里早就存在
 * 的函数（"一起去"报名/退出通知发起人那一步已经在用，见该函数顶部注释），
 * 这次没有改动那个仓库函数本身。
 *
 * 发起人自己看自己发起的活动时不展示这个按钮——判断用 data.organizerId
 * 是否等于当前登录用户 id，跟 ContactSellerButton 隐藏"联系发布者"给作者
 * 本人看的判断是同一个写法；未登录用户仍然能看到按钮（点击后跳
 * /login，不是隐藏，因为这时候还判断不出"是不是自己"）。
 */
export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.user.id;

  const { data, isPending, isError } = useActivityDetailQuery(id ?? "");
  const { data: participants } = useActivityParticipantsQuery(id ?? "");

  const isOrganizer = !!session && !!data && session.user.id === data.organizerId;

  const participationAction = useActivityParticipationAction({
    activityId: id ?? "",
    activityStatus: data?.status ?? "",
    organizerId: data?.organizerId ?? "",
    activityTitle: data?.title ?? "",
    requiresApproval: data?.requiresApproval ?? false
  });

  const canTapEmptySlot = !participationAction.disabled && !participationAction.isApproved;

  const createActivityConversation = useCreateActivityConversationMutation();
  const [contactError, setContactError] = useState<string | null>(null);

  function handleContactOrganizerClick(activityId: string): void {
    if (!currentUserId) {
      navigate("/login");
      return;
    }
    if (createActivityConversation.isPending) return;

    setContactError(null);
    createActivityConversation.mutate(activityId, {
      onSuccess: ({ conversationId }) => {
        navigate(`/messages/${conversationId}`);
      },
      onError: (mutationError) => {
        // 跟 contact-seller-button.tsx 的 handleClick 同一个判断：账号受限
        // 是一个明确、可操作的失败原因，跟其它未知失败原因共用一条"请稍后
        // 重试"文案会误导用户。
        if (mutationError instanceof AppError && mutationError.code === "ACCOUNT_RESTRICTED") {
          setContactError(mutationError.message);
        } else {
          setContactError(CONTACT_ORGANIZER_DEFAULT_ERROR_MESSAGE);
        }
      }
    });
  }

  async function handleShare(activity: ActivityDetail): Promise<void> {
    if (!id) return;
    try {
      await Share.share({
        title: activity.title,
        text: `${formatActivityStartAt(activity.startAt)}・${
          activity.isOnline
            ? "线上活动"
            : activity.landmarkText ??
              (activity.locationName ? formatLocationDisplayName(activity.locationName) : "地点待定")
        }`,
        url: `${PRODUCTION_ORIGIN}/activities/${id}`,
        dialogTitle: "分享"
      });
    } catch (error) {
      // 用户主动关掉系统分享面板也会让这个 promise reject，跟
      // post-detail-page.tsx 的 handleShare 是同一个"两种情况都静默吞掉"
      // 的处理方式，见那边的详细注释。
      console.error("分享失败：", error);
    }
  }

  return (
    <main data-testid="activity-detail-page">
      <TopBar
        variant="detail"
        moreMenu={
          data
            ? {
                label: "更多操作",
                content: (
                  <>
                    <ActivityFavoriteButton activityId={data.id} />
                    <button
                      type="button"
                      onClick={() => void handleShare(data)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-bg"
                    >
                      <Share2 size={16} aria-hidden="true" />
                      分享
                    </button>
                    <Link
                      to={`/activities/${data.id}/report`}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-bg hover:text-danger"
                    >
                      <Flag size={16} aria-hidden="true" />
                      举报
                    </Link>
                  </>
                )
              }
            : undefined
        }
      />

      <div className="mx-auto max-w-2xl px-4 pb-20 md:pb-6">
        {isPending ? <p role="status">加载中…</p> : null}

        {isError ? <p role="alert">活动加载失败，请稍后重试。</p> : null}

        {!isPending && !isError && data === null ? (
          <>
            <h1>活动未找到</h1>
            <p role="alert">活动不存在或已被取消。</p>
          </>
        ) : null}

        {!isPending && !isError && data ? (
          <div className="space-y-4">
            <div>
              <h1 className="mb-2 text-xl font-bold text-text">
                {getActivityChannelMeta(data.channel).emoji} {data.title}
              </h1>
              <div className="flex flex-wrap items-center gap-1">
                <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-text-muted">
                  {getActivityChannelMeta(data.channel).label}
                </span>
                {data.tagText ? (
                  <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-text-muted">
                    {data.tagText}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                发起人：
                <Link to={`/users/${data.organizerId}`} className="text-primary hover:underline">
                  {data.organizerDisplayName}
                </Link>
              </p>
            </div>

            {/* 17 号卡：详情页头像换成跟活动卡片一样的方块（带小圆角）
                形状，并且不再封顶/不出现"+N"——showAllParticipants 让
                组件展示全部参与者、并在网格上方加一行"共 X 人参加"。空位
                点击（canTapEmptySlot/onTapEmptySlot）这一套逻辑完全没动，
                只是空位格子本身也从圆形变成了方块。 */}
            <ActivityParticipantAvatars
              organizerId={data.organizerId}
              organizerDisplayName={data.organizerDisplayName}
              organizerAvatarUrl={data.organizerAvatarUrl}
              participants={participants ?? []}
              capacity={data.capacity}
              canTapEmptySlot={canTapEmptySlot}
              onTapEmptySlot={participationAction.handleClick}
              shape="square"
              showAllParticipants
            />

            {isOrganizer ? (
              <Link
                to={`/activities/${data.id}/notify`}
                className="block w-full rounded-lg border border-primary px-4 py-2 text-center text-sm font-semibold text-primary hover:bg-primary/5"
              >
                📢 通知参与者
              </Link>
            ) : null}

            <p className="text-sm text-text-muted">{formatActivityStartAt(data.startAt)}</p>

            <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
              <p>
                {data.isOnline
                  ? "线上活动"
                  : (data.landmarkText ??
                    (data.locationName ? formatLocationDisplayName(data.locationName) : "地点待定"))}
              </p>
              {!data.isOnline && data.locationName ? (
                <p className="mt-1 text-xs text-text-muted">
                  {formatLocationDisplayName(data.locationName)}
                </p>
              ) : null}
            </div>

            <p className="whitespace-pre-wrap break-words text-sm text-text">{data.description}</p>

            {data.contactMethod && data.contactValue ? (
              <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
                <p className="text-text-muted">联系方式（{data.contactMethod}）</p>
                <p className="break-words font-medium">{data.contactValue}</p>
              </div>
            ) : null}

            <PersonCard
              userId={data.organizerId}
              displayName={data.organizerDisplayName}
              avatarUrl={data.organizerAvatarUrl}
              subtitle="发起人"
            />

            <div className="flex gap-2">
              <div className="flex-1">
                <ActivityParticipationButtonView action={participationAction} />
              </div>
              {currentUserId && data.organizerId === currentUserId ? null : (
                <div className="flex-1">
                  <button
                    type="button"
                    disabled={createActivityConversation.isPending}
                    onClick={() => handleContactOrganizerClick(data.id)}
                    className={SECONDARY_BUTTON_CLASS_NAME}
                  >
                    {createActivityConversation.isPending ? "创建会话中…" : "联系发起人"}
                  </button>
                  {contactError ? (
                    <p
                      role="alert"
                      className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
                    >
                      {contactError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
