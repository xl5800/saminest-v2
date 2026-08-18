import { Share } from "@capacitor/share";
import { MoreHorizontal, Share2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { ActivityFavoriteButton } from "../../components/activity-favorite-button";
import { ActivityParticipantAvatars } from "../../components/activity-participant-avatars";
import {
  ActivityParticipationButtonView,
  SECONDARY_BUTTON_CLASS_NAME
} from "../../components/activity-participation-button";
import { useActivityDetailQuery } from "../../features/activities/use-activity-detail-query";
import { useActivityParticipantsQuery } from "../../features/activities/use-activity-participants-query";
import { useActivityParticipationAction } from "../../features/activities/use-activity-participation-action";
import type { ActivityDetail } from "../../repositories/activities-repository";
import { getActivityChannelMeta } from "../../repositories/activities-repository";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import { formatActivityStartAt } from "../../utils/format";

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
 * 前同一个位置）→ 头像堆叠（含参与人数文案）→ 完整参与者名单（若非空）
 * → 时间 → 地点 → 描述 → 联系方式（若有）→ 发起人卡片 → "查看发起人"/
 * "参加活动" 按钮对 → 收藏/分享/举报操作行。
 *
 * 一致性的关键点：这个页面只调用一次 useActivityParticipationAction，把
 * 同一个 `participationAction` 对象分别交给 ActivityParticipationButtonView
 * （渲染"参加活动"按钮）和 ActivityParticipantAvatars 的
 * onTapEmptySlot/canTapEmptySlot（驱动头像堆叠里的空位点击）——两个入口
 * 背后是同一个 mutation 实例、同一份 disabled 判断，不是分别独立调用两次
 * hook 各自维护一套状态，见 activity-participation-button.tsx 顶部注释。
 *
 * 社交资料页第一批留下的"发起人：{名字}"文字链接和参与者 pill 链接继续
 * 保留在原来的位置，跟这次新增的发起人卡片指向同一个 /users/:id，允许
 * 重复，不需要去重（任务卡明确说明）。
 */
export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError } = useActivityDetailQuery(id ?? "");
  const { data: participants } = useActivityParticipantsQuery(id ?? "");

  const participationAction = useActivityParticipationAction({
    activityId: id ?? "",
    activityStatus: data?.status ?? "",
    organizerId: data?.organizerId ?? "",
    activityTitle: data?.title ?? "",
    requiresApproval: data?.requiresApproval ?? false
  });

  const canTapEmptySlot = !participationAction.disabled && !participationAction.isApproved;

  async function handleShare(activity: ActivityDetail): Promise<void> {
    if (!id) return;
    try {
      await Share.share({
        title: activity.title,
        text: `${formatActivityStartAt(activity.startAt)}・${
          activity.isOnline ? "线上活动" : activity.landmarkText ?? activity.locationName ?? "地点待定"
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
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
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

          <ActivityParticipantAvatars
            organizerId={data.organizerId}
            organizerDisplayName={data.organizerDisplayName}
            organizerAvatarUrl={data.organizerAvatarUrl}
            participants={participants ?? []}
            capacity={data.capacity}
            canTapEmptySlot={canTapEmptySlot}
            onTapEmptySlot={participationAction.handleClick}
          />

          {participants && participants.length > 0 ? (
            <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
              <p className="mb-2 text-text-muted">参与者（{participants.length}）</p>
              <ul className="flex flex-wrap gap-2">
                {participants.map((participant) => (
                  <li key={participant.userId}>
                    <Link
                      to={`/users/${participant.userId}`}
                      className="block rounded-full border border-border bg-white px-2 py-0.5 text-xs text-text hover:border-primary"
                    >
                      {participant.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-sm text-text-muted">{formatActivityStartAt(data.startAt)}</p>

          <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
            <p>{data.isOnline ? "线上活动" : (data.landmarkText ?? data.locationName ?? "地点待定")}</p>
            {!data.isOnline && data.locationName ? (
              <p className="mt-1 text-xs text-text-muted">{data.locationName}</p>
            ) : null}
          </div>

          <p className="whitespace-pre-wrap break-words text-sm text-text">{data.description}</p>

          {data.contactMethod && data.contactValue ? (
            <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
              <p className="text-text-muted">联系方式（{data.contactMethod}）</p>
              <p className="break-words font-medium">{data.contactValue}</p>
            </div>
          ) : null}

          <Link
            to={`/users/${data.organizerId}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-white p-3 hover:border-primary"
          >
            {data.organizerAvatarUrl ? (
              <img
                src={data.organizerAvatarUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
              >
                {data.organizerDisplayName.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <span>
              <span className="block text-sm font-medium text-text">
                {data.organizerDisplayName}
              </span>
              <span className="block text-xs text-text-muted">发起人</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to={`/users/${data.organizerId}`}
              className={SECONDARY_BUTTON_CLASS_NAME}
            >
              查看发起人
            </Link>
            <div className="flex-1">
              <ActivityParticipationButtonView action={participationAction} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ActivityFavoriteButton activityId={data.id} />
            <button
              type="button"
              onClick={() => void handleShare(data)}
              className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
            >
              <Share2 size={16} />
              分享
            </button>
            <Link
              to={`/activities/${data.id}/report`}
              className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-danger hover:underline"
            >
              <MoreHorizontal size={16} />
              举报
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}
