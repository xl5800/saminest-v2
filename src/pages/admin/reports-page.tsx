import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AdminNav } from "../../components/admin-nav";
import { ReasonSheet } from "../../components/reason-sheet";
import { TopBar } from "../../components/top-bar";
import { useAdminArchivePostMutation } from "../../features/admin/use-admin-archive-post-mutation";
import { useAdminCancelActivityMutation } from "../../features/admin/use-admin-cancel-activity-mutation";
import { useAdminDeleteActivityMutation } from "../../features/admin/use-admin-delete-activity-mutation";
import { useAdminDeleteCommunityPostMutation } from "../../features/admin/use-admin-delete-community-post-mutation";
import { useDeleteCommentMutation } from "../../features/admin/use-delete-comment-mutation";
import { useDeletePostMutation } from "../../features/admin/use-delete-post-mutation";
import { useDismissReportMutation } from "../../features/admin/use-dismiss-report-mutation";
import { useReportsQuery } from "../../features/admin/use-reports-query";
import { useResolveReportMutation } from "../../features/admin/use-resolve-report-mutation";
import {
  type AdminReportListItem,
  REPORT_REASON_OPTIONS
} from "../../repositories/reports-repository";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const NOTE_REQUIRED_MESSAGE = "请填写处理说明。";

// 复用 reports-repository.ts 里已经定义好的中文文案，不在这里重复维护一份。
const REASON_LABELS: Record<string, string> = Object.fromEntries(
  REPORT_REASON_OPTIONS.map((option) => [option.value, option.label])
);

/**
 * UGC 安全功能补齐任务卡 4："同时删除"这个复选框从只支持 target_type ===
 * "post" 扩展到 post/comment/activity 三种，每种类型底层调用不同的删除/
 * 下架函数（deletePost/deleteComment/adminCancelActivity），复选框文案、
 * 原因输入框标签、必填校验提示、"处理成功但删除/下架失败"的降级提示都
 * 跟着换成对应的说法——活动那边是"下架"不是"删除"（数据库层是把 status
 * 改成 cancelled，不是设置某个 deleted_at 字段，见
 * supabase/migrations/20260823040000_admin_cancel_activity_function.sql
 * 顶部说明），文案上也不应该说"删除活动"，否则会让管理员误以为活动数据
 * 被物理清除了。三种类型底层状态字段/函数虽然不同，但对这个页面而言都是
 * 同一个形状的"可选、需要填原因、失败要用页面级提示区分于举报处理本身"
 * 交互，所以仍然复用同一套 UI 状态（deleteChecked/deleteReasonDrafts/
 * deleteValidationErrors/partialFailureMessage），只是显示的文案和分发到
 * 哪个 mutation 由 targetType 决定——不需要重新设计这部分状态处理，这也是
 * 任务卡明确要求的"现有降级提示逻辑已经是通用的，改成按 targetType 调用
 * 不同函数即可"。
 *
 * 帖子有独立的"全部帖子"管理页（/admin/posts/all）可以在失败后手动重试，
 * 评论和活动都没有对应的管理列表页——降级提示文案因此没有像帖子那条一样
 * 指向一个具体页面，只建议"稍后重试"或去内容本身所在的详情页确认，避免
 * 引用一个实际上不存在的管理入口。
 */
interface DeleteActionCopy {
  checkboxLabel: string;
  reasonLabel: string;
  reasonRequiredMessage: string;
  partialFailureMessage: string;
}

const POST_DELETE_COPY: DeleteActionCopy = {
  checkboxLabel: "同时删除该帖子",
  reasonLabel: "删除原因",
  reasonRequiredMessage: "请填写删除原因。",
  partialFailureMessage: "举报已处理，但删除帖子失败，请稍后前往「全部帖子」页面重试删除。"
};

const COMMENT_DELETE_COPY: DeleteActionCopy = {
  checkboxLabel: "同时删除该评论",
  reasonLabel: "删除原因",
  reasonRequiredMessage: "请填写删除原因。",
  partialFailureMessage:
    "举报已处理，但删除评论失败，请稍后重试，或前往该评论所在的帖子详情页确认处理结果。"
};

const ACTIVITY_CANCEL_COPY: DeleteActionCopy = {
  checkboxLabel: "同时下架该活动",
  reasonLabel: "下架原因",
  reasonRequiredMessage: "请填写下架原因。",
  partialFailureMessage:
    "举报已处理，但下架活动失败，请稍后重试，或前往该活动详情页确认处理结果。"
};

// 社区功能阶段七：社区帖子没有"全部帖子"那样的管理后台列表页可以手动重试，
// 降级提示用跟 COMMENT_DELETE_COPY 一样"建议去详情页确认"的说法，不是
// POST_DELETE_COPY 那种指向具体管理页面的说法。这里是"删除"不是"下架"——
// 社区帖子这次只做删除（deleted_at），见
// 20261008070000_admin_delete_community_post_function.sql 顶部说明。
const COMMUNITY_POST_DELETE_COPY: DeleteActionCopy = {
  checkboxLabel: "同时删除该社区帖子",
  reasonLabel: "删除原因",
  reasonRequiredMessage: "请填写删除原因。",
  partialFailureMessage:
    "举报已处理，但删除社区帖子失败，请稍后重试，或前往该社区帖子详情页确认处理结果。"
};

function getDeleteActionCopy(targetType: string): DeleteActionCopy | null {
  if (targetType === "post") return POST_DELETE_COPY;
  if (targetType === "comment") return COMMENT_DELETE_COPY;
  if (targetType === "activity") return ACTIVITY_CANCEL_COPY;
  if (targetType === "community_post") return COMMUNITY_POST_DELETE_COPY;
  return null;
}

/**
 * 功能改动清单第 7 项："帖子/活动类新增「下架帖子」「删除帖子」（或「下架
 * 活动」「删除活动」）两个直接操作"——README 原文明确这是"直接操作"，
 * 跟上面 DeleteActionCopy 驱动的"标记已处理时顺便勾选同时删除"是两件不同
 * 的事：这两个新按钮不经过 resolveReport/dismissReport，点了立刻下架/
 * 删除对应的帖子或活动，举报本身的处理状态（pending/reviewing/...）不受
 * 影响，这一行也不会因为点了这两个按钮就从列表消失——管理员可能还要继续
 * 走"标记已处理"把举报本身也处理掉。只对 post/activity 两种 targetType
 * 显示，user/comment 举报没有对应的"下架/删除"目标（评论有独立的删除，
 * 但 README 这次只列了"帖子"和"活动"）。
 */
interface DirectActionCopy {
  archiveTitle: string;
  archiveReasonLabel: string;
  archiveReasonRequiredMessage: string;
  archiveConfirmLabel: string;
  archiveTriggerLabel: string;
  archiveSuccessTag: string;
  deleteTitle: string;
  deleteReasonLabel: string;
  deleteReasonRequiredMessage: string;
  deleteConfirmLabel: string;
  deleteTriggerLabel: string;
  deleteSuccessTag: string;
}

const POST_DIRECT_ACTION_COPY: DirectActionCopy = {
  archiveTitle: "下架帖子",
  archiveReasonLabel: "下架原因",
  archiveReasonRequiredMessage: "请填写下架原因。",
  archiveConfirmLabel: "确认下架",
  archiveTriggerLabel: "下架帖子",
  archiveSuccessTag: "帖子已下架",
  deleteTitle: "删除帖子",
  deleteReasonLabel: "删除原因",
  deleteReasonRequiredMessage: "请填写删除原因。",
  deleteConfirmLabel: "确认删除",
  deleteTriggerLabel: "删除帖子",
  deleteSuccessTag: "帖子已删除"
};

const ACTIVITY_DIRECT_ACTION_COPY: DirectActionCopy = {
  archiveTitle: "下架活动",
  archiveReasonLabel: "下架原因",
  archiveReasonRequiredMessage: "请填写下架原因。",
  archiveConfirmLabel: "确认下架",
  archiveTriggerLabel: "下架活动",
  archiveSuccessTag: "活动已下架",
  deleteTitle: "删除活动",
  deleteReasonLabel: "删除原因",
  deleteReasonRequiredMessage: "请填写删除原因。",
  deleteConfirmLabel: "确认删除",
  deleteTriggerLabel: "删除活动",
  deleteSuccessTag: "活动已删除"
};

function getDirectActionCopy(targetType: string): DirectActionCopy | null {
  if (targetType === "post") return POST_DIRECT_ACTION_COPY;
  if (targetType === "activity") return ACTIVITY_DIRECT_ACTION_COPY;
  return null;
}

type DirectActionKind = "archive" | "delete";

// 跟 reports.status 的 check 约束（reports_status_check）取值一致，默认
// "pending"——这是"如果复杂就先只做 pending 列表"里判断下来的低成本可选项，
// 一个 <select> 驱动查询的 status 参数，不做更复杂的东西。
const STATUS_FILTER_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "reviewing", label: "处理中" },
  { value: "resolved", label: "已处理" },
  { value: "dismissed", label: "已驳回" }
] as const;

type PendingAction = "resolve" | "dismiss";

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

// ReasonSheet 的 targetLabel 需要"这次操作的到底是哪一条"这一句话，跟上面
// 目标那一列（<span> 里那段 report.targetType === "post" ? ... : ...）
// 展示的是同一份信息，只是那边要渲染链接/组件，这里只要纯文本，所以单独
// 抽一个函数，不共用 JSX。评论举报优先展示所属帖子标题（跟目标列一致），
// 其它类型退回 targetTitle，再退回 "targetType / targetId" 兜底。
function getReportTargetLabel(report: AdminReportListItem): string {
  if (report.targetType === "comment" && report.commentPreview) {
    return (
      report.commentPreview.postTitle ?? `post / ${report.commentPreview.postId}`
    );
  }
  return report.targetTitle ?? `${report.targetType} / ${report.targetId}`;
}

/**
 * 管理员举报处理队列（/admin/reports）。整体结构、"本地列表 + 处理后直接
 * 移除这一行"、"每行独立的进行中/展开状态"，都跟 pending-posts-page.tsx
 * 保持同样的模式，方便以后一起维护。这两处目前没有抽出共用组件——两个
 * 页面的行内输入表单只有几行 JSX，抽象出一个共享组件带来的间接层比它省下
 * 的重复更麻烦，等以后出现第三个类似场景再考虑。
 *
 * "同时删除该帖子"：产品明确要求在举报处理表单上加一个可选的删帖入口，
 * 减少管理员来回切换到 /admin/posts/all 的操作。这里刻意不新建一个
 * "resolve-and-delete"数据库函数——resolveReport/dismissReport 和
 * deletePost/deleteComment/adminCancelActivity 各自已经是独立原子的
 * （状态变更 + 审计日志各自在自己的 security definer 函数里一次完成），
 * 从 UI 层顺序调用两个已经原子的操作不需要第三个数据库原语来保证"更大的
 * 原子性"，产品这次要的只是操作上的便利，不是新的后端一致性保证。删除/
 * 下架原因单独用一个输入框收集，不复用处理说明（resolutionNote）——两条
 * 审计日志（resolve_report/dismiss_report 一条，archive_post/
 * delete_comment/cancel_activity 一条）各自独立有意义，理由不应该被强行
 * 合并成一份。UGC 安全功能补齐任务卡 4：这个复选框从只支持帖子扩展到
 * 评论/活动，具体文案/校验/降级提示的取舍见上面 getDeleteActionCopy 的
 * 注释。
 *
 * 失败处理是顺序调用带来的一个新分支：如果 resolveReport/dismissReport
 * 失败，跟今天完全一样（这一行还在、错误提示、处理说明保留）；如果
 * resolveReport/dismissReport 成功但紧接着的 deletePost 失败，举报处理
 * 本身已经是既成事实，这一行还是要移除，但要用一条独立的、页面级的提示
 * 说明"举报处理好了，删帖没成功"——不能既不移除这一行（举报明明已经处理
 * 成功了），也不能什么都不提示（管理员会以为帖子真的被删了）。这条提示
 * 挂在页面级而不是行内，因为这一行马上就要消失，没法承载一条持续展示的
 * 行内错误。
 *
 * UGC 安全功能补齐任务卡 2（举报用户）：target_type === "user" 的举报行
 * 展示被举报用户的昵称（复用 reports-repository.ts 已有的
 * targetTitle/fetchTargetTitles 批量查询模式，只是这次查的是 profiles
 * 表），旁边加一个跳到 /admin/users 的链接。这个链接刻意不带查询参数
 * 精确定位到某一行——AdminUsersPage 的搜索框目前只是组件内部的本地
 * state（见 users-page.tsx 的 searchInput/searchTerm），没有读 URL query
 * string，传参也不会有效果；改 users-page.tsx 让它支持从 URL 带参数搜索
 * 属于账号管理页面自身功能的扩展，不在这次任务允许修改的范围内（任务卡
 * 明确"账号管理页面 set_account_status 相关逻辑本身...不改这个功能内部
 * 实现"，为了这一个跳转链接去扩展它的搜索能力也算是变相扩大了范围）。
 * 昵称已经展示在链接旁边，管理员点进去后自己复制/输入这个昵称搜索即可，
 * 这是任务卡明确认可的简化版本，不强求这次做到精确定位。
 *
 * UGC 安全功能补齐任务卡 3：target_type === "comment" 的举报行不再显示
 * "comment / <id>" 纯文本——目标 span 里改成一个跳到所属帖子（
 * /post/:postId）的链接，链接文字是帖子标题；紧接着单独一块用
 * blockquote 展示评论原文（管理员需要看到"到底是哪句话"），下面一行是
 * 评论作者昵称，评论已经被用户自己软删除时额外加一个"该评论已被用户
 * 删除"的小标签——但原文仍然完整展示，不能因为用户删了就不处理这条举报。
 * 这些信息全部来自 reports-repository.ts 新增的 commentPreview 字段
 * （批量查询，见该文件 fetchTargetTitles 的注释），不需要跳出这个页面单独
 * 去查评论。commentPreview 为 null（比如批量查询失败）时退回跟其它未知
 * target_type 一样的纯文本兜底，不阻断这一行举报的展示。任务卡 3 这次
 * 只做"看得见"，不做删除评论——"同时删除"复选框当时还只在
 * target_type === "post" 时显示，删除评论/下架活动是任务卡 4 补的，见
 * 上面 getDeleteActionCopy 的注释。
 */
export function AdminReportsPage() {
  const [status, setStatus] = useState<string>("pending");
  const { data, isPending, isError } = useReportsQuery(status);
  const resolveMutation = useResolveReportMutation();
  const dismissMutation = useDismissReportMutation();
  const deletePostMutation = useDeletePostMutation();
  const deleteCommentMutation = useDeleteCommentMutation();
  const adminCancelActivityMutation = useAdminCancelActivityMutation();
  const adminDeleteCommunityPostMutation = useAdminDeleteCommunityPostMutation();
  // 功能改动清单第 7 项："下架帖子"/"删除帖子"/"下架活动"/"删除活动"这两对
  // 直接操作用的 mutation，跟上面几个是同一批但服务不同的交互（见
  // getDirectActionCopy 的注释）。adminCancelActivityMutation/
  // deletePostMutation 两个已经在用了，这里只需要再引入
  // adminArchivePostMutation（帖子下架，功能改动清单第 7 项新增）和
  // adminDeleteActivityMutation（活动删除，之前只有 all-posts-page.tsx
  // 在用）。
  const archivePostMutation = useAdminArchivePostMutation();
  const adminDeleteActivityMutation = useAdminDeleteActivityMutation();

  const [reports, setReports] = useState<AdminReportListItem[] | null>(null);
  const [actioningReportId, setActioningReportId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openFormRowId, setOpenFormRowId] = useState<string | null>(null);
  const [openFormAction, setOpenFormAction] = useState<PendingAction | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [deleteChecked, setDeleteChecked] = useState<Record<string, boolean>>({});
  const [deleteReasonDrafts, setDeleteReasonDrafts] = useState<Record<string, string>>(
    {}
  );
  const [deleteValidationErrors, setDeleteValidationErrors] = useState<
    Record<string, string>
  >({});
  const [partialFailureMessage, setPartialFailureMessage] = useState<string | null>(
    null
  );

  // "下架帖子"/"删除帖子"/"下架活动"/"删除活动"独立的一套表单状态——不跟
  // 上面"标记已处理/驳回举报"共享 openFormRowId，这是完全独立的第二类
  // 操作（见 getDirectActionCopy 顶部注释），同一时刻一行最多只展开其中
  // 一种表单（openFormRowId 和 openDirectActionRowId 互斥，由
  // openForm/openDirectActionForm 各自清掉对方，见下面的实现）。
  // directActionResultTags 记这一行最近一次直接操作成功之后应该显示的
  // 标签（"帖子已下架"/"帖子已删除"...），只是本地展示用的临时状态，不
  // 需要跟任何缓存同步——这一行本身不会因为点了这两个按钮就消失。
  const [openDirectActionRowId, setOpenDirectActionRowId] = useState<string | null>(
    null
  );
  const [directActionKind, setDirectActionKind] = useState<DirectActionKind | null>(
    null
  );
  const [directActioningReportId, setDirectActioningReportId] = useState<string | null>(
    null
  );
  const [directActionReasons, setDirectActionReasons] = useState<Record<string, string>>(
    {}
  );
  const [directActionValidationErrors, setDirectActionValidationErrors] = useState<
    Record<string, string>
  >({});
  const [directActionResultTags, setDirectActionResultTags] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (data && reports === null) {
      setReports(data);
    }
  }, [data, reports]);

  function handleStatusChange(nextStatus: string): void {
    setStatus(nextStatus);
    // 切换状态相当于切到一个全新的列表（不同的 queryKey），本地列表也要
    // 跟着重置，否则会在新状态下继续展示上一个状态过滤出来的旧行。
    setReports(null);
    setOpenFormRowId(null);
    setOpenFormAction(null);
    setRowErrors({});
    setValidationErrors({});
    setNoteDrafts({});
    setDeleteChecked({});
    setDeleteReasonDrafts({});
    setDeleteValidationErrors({});
    setPartialFailureMessage(null);
    setOpenDirectActionRowId(null);
    setDirectActionKind(null);
    setDirectActionValidationErrors({});
    setDirectActionReasons({});
    setDirectActionResultTags({});
  }

  function removeReport(reportId: string): void {
    setReports((prev) => (prev ?? []).filter((report) => report.id !== reportId));
  }

  function openForm(reportId: string, action: PendingAction): void {
    setOpenFormRowId(reportId);
    setOpenFormAction(action);
    setValidationErrors((prev) => withoutKey(prev, reportId));
    setDeleteValidationErrors((prev) => withoutKey(prev, reportId));
    setPartialFailureMessage(null);
    // 跟"下架/删除"那套表单状态互斥——同一行不能同时展开两种表单，见
    // openDirectActionForm 里对称的清理。
    setOpenDirectActionRowId((current) => (current === reportId ? null : current));
    setDirectActionKind(null);
  }

  function cancelForm(reportId: string): void {
    setOpenFormRowId((current) => (current === reportId ? null : current));
    setOpenFormAction(null);
  }

  function openDirectActionForm(reportId: string, kind: DirectActionKind): void {
    setOpenDirectActionRowId(reportId);
    setDirectActionKind(kind);
    setDirectActionValidationErrors((prev) => withoutKey(prev, reportId));
    setRowErrors((prev) => withoutKey(prev, reportId));
    // 跟"标记已处理/驳回举报"那套表单状态互斥，见 openForm 里对称的清理。
    setOpenFormRowId((current) => (current === reportId ? null : current));
    setOpenFormAction(null);
  }

  function cancelDirectActionForm(reportId: string): void {
    setOpenDirectActionRowId((current) => (current === reportId ? null : current));
    setDirectActionKind(null);
  }

  /**
   * "下架帖子"/"删除帖子"/"下架活动"/"删除活动"——独立于 handleConfirm
   * （标记已处理/驳回举报）的一条单独提交路径，不调用
   * resolveMutation/dismissMutation，这一行处理完之后还留在列表里（见
   * getDirectActionCopy 顶部注释）。
   */
  async function handleConfirmDirectAction(
    report: AdminReportListItem,
    kind: DirectActionKind
  ): Promise<void> {
    const copy = getDirectActionCopy(report.targetType);
    if (!copy) return;

    const reason = (directActionReasons[report.id] ?? "").trim();
    const requiredMessage =
      kind === "archive" ? copy.archiveReasonRequiredMessage : copy.deleteReasonRequiredMessage;

    if (!reason) {
      setDirectActionValidationErrors((prev) => ({ ...prev, [report.id]: requiredMessage }));
      return;
    }

    setDirectActionValidationErrors((prev) => withoutKey(prev, report.id));
    setRowErrors((prev) => withoutKey(prev, report.id));
    setDirectActioningReportId(report.id);
    try {
      if (report.targetType === "post") {
        if (kind === "archive") {
          await archivePostMutation.mutateAsync({ postId: report.targetId, archiveNote: reason });
        } else {
          await deletePostMutation.mutateAsync({ postId: report.targetId, deleteReason: reason });
        }
      } else {
        if (kind === "archive") {
          await adminCancelActivityMutation.mutateAsync({
            activityId: report.targetId,
            cancelReason: reason
          });
        } else {
          await adminDeleteActivityMutation.mutateAsync({
            activityId: report.targetId,
            deleteReason: reason
          });
        }
      }

      setOpenDirectActionRowId((current) => (current === report.id ? null : current));
      setDirectActionKind(null);
      setDirectActionReasons((prev) => withoutKey(prev, report.id));
      setDirectActionResultTags((prev) => ({
        ...prev,
        [report.id]: kind === "archive" ? copy.archiveSuccessTag : copy.deleteSuccessTag
      }));
    } catch {
      // 提交失败时特意不清空 directActionReasons，保留管理员已经输入的
      // 原因，跟这个页面/其它管理页一致的"失败不丢用户输入"原则。
      setRowErrors((prev) => ({ ...prev, [report.id]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setDirectActioningReportId(null);
    }
  }

  async function handleConfirm(reportId: string, action: PendingAction): Promise<void> {
    const report = (reports ?? []).find((item) => item.id === reportId);
    const deleteCopy = report ? getDeleteActionCopy(report.targetType) : null;

    const note = (noteDrafts[reportId] ?? "").trim();
    const shouldDeleteTarget = deleteChecked[reportId] ?? false;
    const deleteReason = (deleteReasonDrafts[reportId] ?? "").trim();

    let hasValidationError = false;

    if (!note) {
      setValidationErrors((prev) => ({ ...prev, [reportId]: NOTE_REQUIRED_MESSAGE }));
      hasValidationError = true;
    } else {
      setValidationErrors((prev) => withoutKey(prev, reportId));
    }

    if (shouldDeleteTarget && !deleteReason) {
      setDeleteValidationErrors((prev) => ({
        ...prev,
        [reportId]: deleteCopy?.reasonRequiredMessage ?? GENERIC_ERROR_MESSAGE
      }));
      hasValidationError = true;
    } else {
      setDeleteValidationErrors((prev) => withoutKey(prev, reportId));
    }

    if (hasValidationError) {
      return;
    }

    setRowErrors((prev) => withoutKey(prev, reportId));
    setPartialFailureMessage(null);
    setActioningReportId(reportId);
    try {
      if (action === "resolve") {
        await resolveMutation.mutateAsync({ reportId, resolutionNote: note });
      } else {
        await dismissMutation.mutateAsync({ reportId, resolutionNote: note });
      }

      // 举报处理（resolve/dismiss）这一步已经成功——不管接下来的删除/下架
      // 是否还要做、做不做得成，这一行都要从列表移除，因为举报处理本身
      // 已经是既成事实。
      if (shouldDeleteTarget && report) {
        try {
          if (report.targetType === "comment") {
            await deleteCommentMutation.mutateAsync({
              commentId: report.targetId,
              deleteReason
            });
          } else if (report.targetType === "activity") {
            await adminCancelActivityMutation.mutateAsync({
              activityId: report.targetId,
              cancelReason: deleteReason
            });
          } else if (report.targetType === "community_post") {
            // 社区功能阶段七：必须有这个显式分支——上面 getDeleteActionCopy
            // 现在会给 community_post 返回非空文案（复选框会显示），如果
            // 漏了这里，会落进下面兜底的 deletePost，拿社区帖子 id 去调
            // delete_post，必然"帖子不存在"失败，还会被误报成降级提示。
            await adminDeleteCommunityPostMutation.mutateAsync({
              postId: report.targetId,
              deleteReason
            });
          } else {
            await deletePostMutation.mutateAsync({
              postId: report.targetId,
              deleteReason
            });
          }
        } catch {
          removeReport(reportId);
          setOpenFormRowId((current) => (current === reportId ? null : current));
          setOpenFormAction(null);
          setNoteDrafts((prev) => withoutKey(prev, reportId));
          setDeleteChecked((prev) => withoutKey(prev, reportId));
          setDeleteReasonDrafts((prev) => withoutKey(prev, reportId));
          setPartialFailureMessage(
            deleteCopy?.partialFailureMessage ?? POST_DELETE_COPY.partialFailureMessage
          );
          return;
        }
      }

      removeReport(reportId);
      setOpenFormRowId((current) => (current === reportId ? null : current));
      setOpenFormAction(null);
      setNoteDrafts((prev) => withoutKey(prev, reportId));
      setDeleteChecked((prev) => withoutKey(prev, reportId));
      setDeleteReasonDrafts((prev) => withoutKey(prev, reportId));
    } catch {
      // 提交失败时特意不清空 noteDrafts / deleteReasonDrafts，保留管理员
      // 已经输入的内容。
      setRowErrors((prev) => ({ ...prev, [reportId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningReportId(null);
    }
  }

  // 从原生 <select> 改成胶囊 Chips（功能改动清单第 7 项："状态分段
  // 待处理/处理中/已处理/已驳回"），视觉沿用 all-posts-page.tsx 已经建立的
  // chip 写法，理由同那边的注释。
  const statusFilter = (
    <div className="mb-4 flex flex-wrap gap-2">
      {STATUS_FILTER_OPTIONS.map((option) => {
        const active = status === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleStatusChange(option.value)}
            aria-pressed={active}
            className={
              active
                ? "flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-sm whitespace-nowrap bg-primary font-semibold text-white"
                : "flex h-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg px-3 text-sm whitespace-nowrap text-text-muted"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const partialFailureBanner = partialFailureMessage ? (
    <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {partialFailureMessage}
    </p>
  ) : null;

  if (isPending) {
    return (
      <main>
        <TopBar variant="nav-only" title="举报处理" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          {statusFilter}
          {partialFailureBanner}
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <TopBar variant="nav-only" title="举报处理" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          {statusFilter}
          {partialFailureBanner}
          <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            举报加载失败，请稍后重试。
          </p>
        </div>
      </main>
    );
  }

  const visibleReports = reports ?? [];

  return (
    <main>
      <TopBar variant="nav-only" title="举报处理" />
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <AdminNav />
      {statusFilter}
      {partialFailureBanner}
      {visibleReports.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">暂无举报</p>
      ) : (
        <ul>
          {visibleReports.map((report) => {
            const isActioning = actioningReportId === report.id;
            const isFormOpen = openFormRowId === report.id;
            const isDirectActionOpen = openDirectActionRowId === report.id;
            // getDirectActionCopy 只对 post/activity 两种 targetType 返回
            // 非空值，见该函数顶部注释——user/comment 举报没有对应的"下架/
            // 删除"直接操作按钮。
            const directCopy = getDirectActionCopy(report.targetType);
            const deleteCopy = getDeleteActionCopy(report.targetType);

            return (
              <li key={report.id} className="mb-2 rounded-lg border border-border bg-card p-4">
                <span className="mr-3 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                  {REASON_LABELS[report.reasonCode] ?? report.reasonCode}
                </span>
                <span className="mr-3 break-words text-sm text-text">{report.reporterName}</span>
                <span className="mr-3 break-words text-sm text-text-muted">
                  {report.targetType === "post" ? (
                    <Link to={`/post/${report.targetId}`} className="text-primary hover:underline">
                      {report.targetTitle ?? `${report.targetType} / ${report.targetId}`}
                    </Link>
                  ) : report.targetType === "activity" ? (
                    <Link to={`/activities/${report.targetId}`} className="text-primary hover:underline">
                      {report.targetTitle ?? `${report.targetType} / ${report.targetId}`}
                    </Link>
                  ) : report.targetType === "community_post" ? (
                    <Link
                      to={`/community/post/${report.targetId}`}
                      className="text-primary hover:underline"
                    >
                      {report.targetTitle ?? `${report.targetType} / ${report.targetId}`}
                    </Link>
                  ) : report.targetType === "user" ? (
                    <>
                      {report.targetTitle ?? `${report.targetType} / ${report.targetId}`}
                      {" "}
                      <Link to="/admin/users" className="text-primary hover:underline">
                        去账号管理搜索处理
                      </Link>
                    </>
                  ) : report.targetType === "comment" ? (
                    report.commentPreview ? (
                      <Link
                        to={`/post/${report.commentPreview.postId}`}
                        className="text-primary hover:underline"
                      >
                        {report.commentPreview.postTitle ?? `post / ${report.commentPreview.postId}`}
                      </Link>
                    ) : (
                      `${report.targetType} / ${report.targetId}`
                    )
                  ) : (
                    `${report.targetType} / ${report.targetId}`
                  )}
                </span>
                <span className="mr-3 text-sm text-text-muted">{formatPublishedAt(report.createdAt)}</span>
                {report.targetType === "comment" && report.commentPreview ? (
                  <div className="mt-2">
                    <blockquote className="border-l-4 border-border bg-bg px-3 py-2 text-sm text-text">
                      {report.commentPreview.content}
                    </blockquote>
                    <p className="mt-1 text-xs text-text-muted">
                      评论作者：{report.commentPreview.authorDisplayName}
                      {report.commentPreview.isDeleted ? (
                        <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                          该评论已被用户删除
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text">
                  {report.description ? report.description : "（举报人未填写补充说明）"}
                </p>
                {rowErrors[report.id] ? (
                  <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[report.id]}
                  </p>
                ) : null}
                {directActionResultTags[report.id] ? (
                  <p className="mt-2 inline-block rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                    {directActionResultTags[report.id]}
                  </p>
                ) : null}
                {isFormOpen || isDirectActionOpen ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openForm(report.id, "resolve")}
                      className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      标记已处理
                    </button>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openForm(report.id, "dismiss")}
                      className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      驳回举报
                    </button>
                    {directCopy ? (
                      <>
                        <button
                          type="button"
                          disabled={isActioning}
                          onClick={() => openDirectActionForm(report.id, "archive")}
                          className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {directCopy.archiveTriggerLabel}
                        </button>
                        <button
                          type="button"
                          disabled={isActioning}
                          onClick={() => openDirectActionForm(report.id, "delete")}
                          className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {directCopy.deleteTriggerLabel}
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
                {isFormOpen ? (
                  <ReasonSheet
                    title={openFormAction === "resolve" ? "标记已处理" : "驳回举报"}
                    targetLabel={getReportTargetLabel(report)}
                    reasonLabel="处理说明"
                    reasonValue={noteDrafts[report.id] ?? ""}
                    onReasonChange={(value) =>
                      setNoteDrafts((prev) => ({ ...prev, [report.id]: value }))
                    }
                    secondaryOption={
                      deleteCopy
                        ? {
                            checkboxLabel: deleteCopy.checkboxLabel,
                            checked: deleteChecked[report.id] ?? false,
                            onCheckedChange: (checked) =>
                              setDeleteChecked((prev) => ({ ...prev, [report.id]: checked })),
                            reasonLabel: deleteCopy.reasonLabel,
                            reasonValue: deleteReasonDrafts[report.id] ?? "",
                            onReasonChange: (value) =>
                              setDeleteReasonDrafts((prev) => ({ ...prev, [report.id]: value }))
                          }
                        : undefined
                    }
                    // 处理说明和"同时删除/下架"的原因各自有独立的校验错误
                    // （validationErrors / deleteValidationErrors），但
                    // ReasonSheet 只留了一个错误提示位——两者理论上可能同时
                    // 触发（处理说明和第二个原因都没填），这里按"先提示处理
                    // 说明缺失"的顺序取一个展示，管理员补上之后重新点确认，
                    // 另一条校验错误自然会在下一轮提交里浮现，不需要在这一个
                    // 提示位里同时塞两条信息。
                    errorMessage={
                      validationErrors[report.id] ?? deleteValidationErrors[report.id] ?? null
                    }
                    confirmLabel={openFormAction === "resolve" ? "确认标记已处理" : "确认驳回举报"}
                    destructive={openFormAction === "dismiss"}
                    pending={isActioning}
                    onConfirm={() => handleConfirm(report.id, openFormAction as PendingAction)}
                    onClose={() => cancelForm(report.id)}
                  />
                ) : null}
                {isDirectActionOpen && directCopy && directActionKind ? (
                  <ReasonSheet
                    title={
                      directActionKind === "archive" ? directCopy.archiveTitle : directCopy.deleteTitle
                    }
                    targetLabel={getReportTargetLabel(report)}
                    reasonLabel={
                      directActionKind === "archive"
                        ? directCopy.archiveReasonLabel
                        : directCopy.deleteReasonLabel
                    }
                    reasonValue={directActionReasons[report.id] ?? ""}
                    onReasonChange={(value) =>
                      setDirectActionReasons((prev) => ({ ...prev, [report.id]: value }))
                    }
                    errorMessage={directActionValidationErrors[report.id] ?? null}
                    confirmLabel={
                      directActionKind === "archive"
                        ? directCopy.archiveConfirmLabel
                        : directCopy.deleteConfirmLabel
                    }
                    // 下架和删除都算破坏性操作（跟 all-posts-page.tsx 的
                    // 下架/删除按钮同样用红色 bg-danger 实心按钮的理由一致，
                    // 见该文件相关注释），不区分 archive/delete 都传
                    // destructive。
                    destructive
                    pending={directActioningReportId === report.id}
                    onConfirm={() => handleConfirmDirectAction(report, directActionKind)}
                    onClose={() => cancelDirectActionForm(report.id)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </main>
  );
}
