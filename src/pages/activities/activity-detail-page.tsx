import { Link, useParams } from "react-router-dom";

import { ActivityParticipationButton } from "../../components/activity-participation-button";
import { useActivityDetailQuery } from "../../features/activities/use-activity-detail-query";
import { useActivityParticipantsQuery } from "../../features/activities/use-activity-participants-query";
import { getActivityChannelMeta } from "../../repositories/activities-repository";
import {
  formatActivityParticipantSummary,
  formatActivityStartAt
} from "../../utils/format";

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
 * "举报"入口（P0）跟 post-detail-page.tsx 的举报链接用同一个位置和视觉
 * 权重（`text-sm text-text-muted hover:text-danger hover:underline`，
 * 放在页面主要操作之后），只是这里没有收藏/联系发布者这类同排的按钮，
 * 单独占一行，不强行凑一个看起来一样但语义不存在的按钮组。
 */
export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError } = useActivityDetailQuery(id ?? "");
  const { data: participants } = useActivityParticipantsQuery(id ?? "");

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
            <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
              <span>发起人：{data.organizerDisplayName}</span>
              <span>{formatActivityStartAt(data.startAt)}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
            <p>{data.isOnline ? "线上活动" : (data.landmarkText ?? data.locationName ?? "地点待定")}</p>
            {!data.isOnline && data.locationName ? (
              <p className="mt-1 text-xs text-text-muted">{data.locationName}</p>
            ) : null}
          </div>

          <p className="whitespace-pre-wrap break-words text-sm text-text">{data.description}</p>

          <p className="text-sm font-medium text-accent">
            {formatActivityParticipantSummary(data.participantCount, data.capacity)}
          </p>

          {participants && participants.length > 0 ? (
            <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
              <p className="mb-2 text-text-muted">参与者（{participants.length}）</p>
              <ul className="flex flex-wrap gap-2">
                {participants.map((participant) => (
                  <li
                    key={participant.userId}
                    className="rounded-full border border-border bg-white px-2 py-0.5 text-xs text-text"
                  >
                    {participant.displayName}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.contactMethod && data.contactValue ? (
            <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
              <p className="text-text-muted">联系方式（{data.contactMethod}）</p>
              <p className="break-words font-medium">{data.contactValue}</p>
            </div>
          ) : null}

          <ActivityParticipationButton
            activityId={data.id}
            activityStatus={data.status}
            organizerId={data.organizerId}
            activityTitle={data.title}
            requiresApproval={data.requiresApproval}
          />

          <div className="flex items-center gap-4">
            <Link
              to={`/activities/${data.id}/report`}
              className="text-sm text-text-muted hover:text-danger hover:underline"
            >
              举报
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}
