import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useCancelActivityMutation } from "../../features/activities/use-cancel-activity-mutation";
import { useModerateActivityParticipantMutation } from "../../features/activities/use-moderate-activity-participant-mutation";
import { useMyJoinedActivitiesQuery } from "../../features/activities/use-my-joined-activities-query";
import { useMyOrganizedActivitiesQuery } from "../../features/activities/use-my-organized-activities-query";
import { usePendingActivityParticipantsQuery } from "../../features/activities/use-pending-activity-participants-query";
import { useToggleActivityParticipationMutation } from "../../features/activities/use-toggle-activity-participation-mutation";
import {
  getActivityChannelMeta,
  type ActivityListItem,
  type MyJoinedActivityItem,
  type PendingActivityParticipant
} from "../../repositories/activities-repository";
import { useAuthStore } from "../../store/auth-store";
import {
  formatActivityParticipantSummary,
  formatActivityStartAt
} from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";

// 面向用户自己的状态文案 + 配色，四档映射逻辑照抄 my-posts-page.tsx 的
// statusBadgeClassName（success/warning/danger/中性四档），同一个"状态
// 徽章"UI 概念沿用同一套配色规则，不新发明一套。
const STATUS_LABELS: Record<string, string> = {
  open: "招募中",
  full: "已满员",
  cancelled: "已取消",
  ended: "已结束"
};

function statusBadgeClassName(status: string): string {
  if (status === "open") return "bg-success/10 text-success";
  if (status === "full") return "bg-warning/10 text-warning";
  if (status === "cancelled") return "bg-danger/10 text-danger";
  return "bg-bg text-text-muted";
}

// 发起人还能主动取消的状态——已取消/已结束的活动不再展示"取消活动"操作。
const CANCELLABLE_STATUSES = new Set(["open", "full"]);

type Tab = "organized" | "joined";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "organized", label: "我发起的" },
  { value: "joined", label: "我报名的" }
];

interface ActivityCardProps {
  activity: ActivityListItem;
  error?: string;
  note?: ReactNode;
  action: ReactNode;
  /** "我发起的" tab 专用的待审核申请展开区块，跟活动本身的展示/操作是
   *  两件独立的事，用一个单独的可选插槽注入，不塞进共享的 action 里。 */
  extra?: ReactNode;
}

/**
 * 两个 tab 共用的卡片展示部分（emoji+标题/地点/时间/频道/人数汇总），
 * 只有卡片底部的操作按钮不一样，用 action 这个 ReactNode 参数注入，避免
 * 两个 tab 各写一遍几乎一样的卡片布局。note 是一行可选的状态提示文字
 * （"发起人已取消此活动"/"申请中，等待发起人同意"），extra 是"我发起的"
 * tab 专用的待审核申请区块。
 */
function ActivityCard({ activity, error, note, action, extra }: ActivityCardProps) {
  const { emoji, label } = getActivityChannelMeta(activity.channel);

  return (
    <li className="rounded-2xl border border-border bg-white p-3 shadow-card">
      <Link to={`/activities/${activity.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 break-words text-base text-text">
            {emoji} {activity.title}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClassName(activity.status)}`}
          >
            {STATUS_LABELS[activity.status] ?? activity.status}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-text-muted">
          {label} · {activity.isOnline ? "线上" : activity.landmarkText ?? activity.locationName ?? "地点待定"}
        </p>
        <p className="mt-1 text-xs text-text-muted">{formatActivityStartAt(activity.startAt)}</p>
        <p className="mt-1 text-xs text-accent">
          {formatActivityParticipantSummary(activity.participantCount, activity.capacity)}
        </p>
        {activity.status === "cancelled" ? (
          <p className="mt-1 text-xs text-danger">发起人已取消此活动</p>
        ) : null}
        {note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}
      </Link>

      {error ? (
        <p role="alert" className="mt-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">{action}</div>

      {extra}
    </li>
  );
}

interface PendingApplicantsPanelProps {
  applicants: PendingActivityParticipant[];
  actioningParticipantId: string | null;
  participantErrors: Record<string, string>;
  onApprove: (applicant: PendingActivityParticipant) => void;
  onReject: (applicant: PendingActivityParticipant) => void;
}

/**
 * "待审核申请（N）"展开区块，只在 requires_approval 的活动卡片上出现。
 * 用原生 <details>/<summary> 做展开/收起——这个仓库目前没有需要"点击展开
 * 一段内容"的先例（"更多"菜单是常驻展开，没有折叠状态），<details> 是
 * 浏览器原生支持的最简单实现，不需要额外的 open/close state。
 */
function PendingApplicantsPanel({
  applicants,
  actioningParticipantId,
  participantErrors,
  onApprove,
  onReject
}: PendingApplicantsPanelProps) {
  if (applicants.length === 0) return null;

  return (
    <details className="mt-3 border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-medium text-primary">
        待审核申请（{applicants.length}）
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {applicants.map((applicant) => {
          const isActioning = actioningParticipantId === applicant.participantId;
          return (
            <li key={applicant.participantId} className="rounded-lg border border-border bg-bg p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="break-words text-sm text-text">{applicant.displayName}</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => onApprove(applicant)}
                    className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    同意
                  </button>
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => onReject(applicant)}
                    className="rounded-lg border border-danger px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    拒绝
                  </button>
                </div>
              </div>
              {participantErrors[applicant.participantId] ? (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {participantErrors[applicant.participantId]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * "我的活动"管理页（/my-activities，路由已在 routes.tsx 用 RequireAuth
 * 包裹）。两个 tab（我发起的/我报名的）背后是两张完全不同的查询（分别读
 * activities.organizer_id 和 activity_participants），不是同一个查询的
 * 不同筛选参数，所以两个 useQuery 都无条件发出、tab 切换只是本地展示
 * 哪一份数据的问题——跟 admin/reports-page.tsx 那种"切换 status 就是切换
 * 同一个查询的参数、必须重新发请求"的场景不一样，这里不需要那套"切 tab
 * 就清空本地列表、等重新 fetch"的逻辑。
 *
 * 每个 tab 各自的本地列表 state + 操作后直接更新/移除对应行、不
 * invalidate 查询，是跟 my-posts-page.tsx 完全一致的模式。
 *
 * "取消活动"复用 my-posts-page.tsx 的居中弹窗确认模式（role="dialog"）；
 * "退出"没有确认弹窗、单击直接执行——这是任务卡明确要求的两种不同交互，
 * 不是遗漏了给退出也加一个确认框。
 *
 * "退出"用 useToggleActivityParticipationMutation（活动详情页的退出按钮
 * 用的同一个 hook），不是直接调裸的 leaveActivity——同一个"退出活动"动作
 * 不管从哪个入口触发都应该有一致的效果，包括成功后给发起人发的那条私信
 * 通知。
 *
 * P2 报名审核制新增两块：
 * 1. "我发起的" tab 每张 requires_approval 的卡片上加"待审核申请"展开
 *    区块（同意/拒绝按钮）。待处理申请一次性批量查（见
 *    usePendingActivityParticipantsQuery），不是每张卡片单独查一次。
 *    同意成功后，本地把这张活动的 participantCount +1、按容量判断要不要
 *    翻成 'full'——这段逻辑是把迁移文件里 sync_activity_participant_count
 *    触发器的同一段判断在前端镜像一遍（只有 approve 会改变计数，reject
 *    不会，这两条分支跟触发器逐字对应），不是发明新规则；选择本地镜像
 *    而不是重新拉一次整个"我发起的"列表，是为了避免多打一次网络请求，
 *    跟这个页面 cancelActivity 之后本地直接把 status 设成 'cancelled'
 *    是同一个"已知会怎么变，直接本地算"的思路。
 * 2. "我报名的" tab 的卡片如果是 pending 状态，加一行"申请中，等待发起人
 *    同意"的提示——数据源是 listMyJoinedActivities 返回的
 *    participationStatus 字段（rejected 的申请已经在 repository 层被
 *    过滤掉，不会出现在这个 tab，见该函数注释）。
 */
export function MyActivitiesPage() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const [tab, setTab] = useState<Tab>("organized");

  const organizedQuery = useMyOrganizedActivitiesQuery();
  const joinedQuery = useMyJoinedActivitiesQuery();
  const cancelMutation = useCancelActivityMutation();
  const toggleParticipationMutation = useToggleActivityParticipationMutation();
  const moderateMutation = useModerateActivityParticipantMutation();

  const [organizedActivities, setOrganizedActivities] = useState<ActivityListItem[] | null>(
    null
  );
  const [joinedActivities, setJoinedActivities] = useState<MyJoinedActivityItem[] | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const pendingApprovalActivityIds = useMemo(
    () => (organizedActivities ?? []).filter((activity) => activity.requiresApproval).map((activity) => activity.id),
    [organizedActivities]
  );
  const pendingParticipantsQuery = usePendingActivityParticipantsQuery(pendingApprovalActivityIds);
  const [pendingParticipants, setPendingParticipants] = useState<
    PendingActivityParticipant[] | null
  >(null);
  const [actioningParticipantId, setActioningParticipantId] = useState<string | null>(null);
  const [participantErrors, setParticipantErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (organizedQuery.data && organizedActivities === null) {
      setOrganizedActivities(organizedQuery.data);
    }
  }, [organizedQuery.data, organizedActivities]);

  useEffect(() => {
    if (joinedQuery.data && joinedActivities === null) {
      setJoinedActivities(joinedQuery.data);
    }
  }, [joinedQuery.data, joinedActivities]);

  useEffect(() => {
    if (pendingParticipantsQuery.data && pendingParticipants === null) {
      setPendingParticipants(pendingParticipantsQuery.data);
    }
  }, [pendingParticipantsQuery.data, pendingParticipants]);

  function clearRowError(activityId: string): void {
    setRowErrors((prev) => {
      if (!(activityId in prev)) return prev;
      const next = { ...prev };
      delete next[activityId];
      return next;
    });
  }

  function clearParticipantError(participantId: string): void {
    setParticipantErrors((prev) => {
      if (!(participantId in prev)) return prev;
      const next = { ...prev };
      delete next[participantId];
      return next;
    });
  }

  async function handleConfirmCancel(activityId: string): Promise<void> {
    clearRowError(activityId);
    setActioningId(activityId);
    try {
      await cancelMutation.mutateAsync(activityId);
      setOrganizedActivities((prev) =>
        (prev ?? []).map((activity) =>
          activity.id === activityId ? { ...activity, status: "cancelled" } : activity
        )
      );
      setConfirmCancelId(null);
    } catch {
      setRowErrors((prev) => ({ ...prev, [activityId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningId(null);
    }
  }

  async function handleLeave(activity: ActivityListItem): Promise<void> {
    if (!userId) return;
    const activityId = activity.id;
    clearRowError(activityId);
    setActioningId(activityId);
    try {
      await toggleParticipationMutation.mutateAsync({
        activityId,
        userId,
        isCurrentlyJoined: true,
        organizerId: activity.organizerId,
        activityTitle: activity.title,
        requiresApproval: activity.requiresApproval
      });
      setJoinedActivities((prev) => (prev ?? []).filter((item) => item.id !== activityId));
    } catch {
      setRowErrors((prev) => ({ ...prev, [activityId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningId(null);
    }
  }

  // 同意成功后本地把这张活动的 participantCount +1、按容量判断要不要
  // 翻成 'full'——跟 sync_activity_participant_count 触发器里
  // "capacity is not null and count>=capacity and status='open' then
  // 'full'"这一支逐字对应，见上面函数级注释。拒绝不改变计数，不需要
  // 更新 organizedActivities。
  function applyApprovalLocally(activityId: string): void {
    setOrganizedActivities((prev) =>
      (prev ?? []).map((activity) => {
        if (activity.id !== activityId) return activity;
        const nextCount = activity.participantCount + 1;
        const nextStatus =
          activity.capacity !== null && nextCount >= activity.capacity && activity.status === "open"
            ? "full"
            : activity.status;
        return { ...activity, participantCount: nextCount, status: nextStatus };
      })
    );
  }

  async function handleModerate(
    applicant: PendingActivityParticipant,
    decision: "approve" | "reject"
  ): Promise<void> {
    if (!userId) return;
    const activity = (organizedActivities ?? []).find((item) => item.id === applicant.activityId);
    if (!activity) return;

    clearParticipantError(applicant.participantId);
    setActioningParticipantId(applicant.participantId);
    try {
      await moderateMutation.mutateAsync({
        participantId: applicant.participantId,
        decision,
        applicantId: applicant.userId,
        organizerId: userId,
        activityTitle: activity.title
      });
      if (decision === "approve") {
        applyApprovalLocally(activity.id);
      }
      setPendingParticipants((prev) =>
        (prev ?? []).filter((item) => item.participantId !== applicant.participantId)
      );
    } catch {
      setParticipantErrors((prev) => ({
        ...prev,
        [applicant.participantId]: GENERIC_ERROR_MESSAGE
      }));
    } finally {
      setActioningParticipantId(null);
    }
  }

  const tabNav = (
    <nav aria-label="我的活动分类" className="mb-4 flex gap-2">
      {TAB_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-current={tab === option.value ? "page" : undefined}
          onClick={() => setTab(option.value)}
          className={
            tab === option.value
              ? "flex h-10 flex-1 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
              : "flex h-10 flex-1 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted"
          }
        >
          {option.label}
        </button>
      ))}
    </nav>
  );

  const isOrganizedTab = tab === "organized";
  const activeQuery = isOrganizedTab ? organizedQuery : joinedQuery;
  const visibleOrganizedActivities = organizedActivities ?? [];
  const visibleJoinedActivities = joinedActivities ?? [];
  const visibleCount = isOrganizedTab ? visibleOrganizedActivities.length : visibleJoinedActivities.length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">我的活动</h1>
      {tabNav}

      {activeQuery.isPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}

      {activeQuery.isError ? (
        <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          活动加载失败，请稍后重试。
        </p>
      ) : null}

      {!activeQuery.isPending && !activeQuery.isError && visibleCount === 0 ? (
        isOrganizedTab ? (
          <p role="status" className="text-sm text-text-muted">
            还没有发起过活动，
            <Link to="/activities/new" className="text-primary hover:underline">
              去发起一个
            </Link>
            。
          </p>
        ) : (
          <p role="status" className="text-sm text-text-muted">
            还没有报名过活动，
            <Link to="/activities" className="text-primary hover:underline">
              去看看有什么活动
            </Link>
            。
          </p>
        )
      ) : null}

      {!activeQuery.isPending && !activeQuery.isError && isOrganizedTab && visibleOrganizedActivities.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visibleOrganizedActivities.map((activity) => {
            const isActioning = actioningId === activity.id;
            const applicantsForThisActivity = (pendingParticipants ?? []).filter(
              (applicant) => applicant.activityId === activity.id
            );
            return (
              <ActivityCard
                key={activity.id}
                activity={activity}
                error={rowErrors[activity.id]}
                action={
                  CANCELLABLE_STATUSES.has(activity.status) ? (
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => setConfirmCancelId(activity.id)}
                      className="rounded-xl border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      取消活动
                    </button>
                  ) : null
                }
                extra={
                  activity.requiresApproval ? (
                    <PendingApplicantsPanel
                      applicants={applicantsForThisActivity}
                      actioningParticipantId={actioningParticipantId}
                      participantErrors={participantErrors}
                      onApprove={(applicant) => void handleModerate(applicant, "approve")}
                      onReject={(applicant) => void handleModerate(applicant, "reject")}
                    />
                  ) : null
                }
              />
            );
          })}
        </ul>
      ) : null}

      {!activeQuery.isPending && !activeQuery.isError && !isOrganizedTab && visibleJoinedActivities.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visibleJoinedActivities.map((activity) => {
            const isActioning = actioningId === activity.id;
            return (
              <ActivityCard
                key={activity.id}
                activity={activity}
                error={rowErrors[activity.id]}
                note={
                  activity.participationStatus === "pending" ? "申请中，等待发起人同意" : undefined
                }
                action={
                  <button
                    type="button"
                    disabled={isActioning}
                    onClick={() => void handleLeave(activity)}
                    className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isActioning ? "处理中…" : "退出"}
                  </button>
                }
              />
            );
          })}
        </ul>
      ) : null}

      {confirmCancelId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="确认取消"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-card">
            <p className="mb-4 text-base text-text">确定要取消这场活动吗？取消后无法恢复。</p>
            {rowErrors[confirmCancelId] ? (
              <p role="alert" className="mb-3 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                {rowErrors[confirmCancelId]}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={actioningId === confirmCancelId}
                onClick={() => setConfirmCancelId(null)}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                disabled={actioningId === confirmCancelId}
                onClick={() => handleConfirmCancel(confirmCancelId)}
                className="flex-1 rounded-xl border border-danger bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
