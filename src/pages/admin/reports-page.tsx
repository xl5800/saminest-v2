import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { AdminNav } from "../../components/admin-nav";
import { useAdminCancelActivityMutation } from "../../features/admin/use-admin-cancel-activity-mutation";
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

function getDeleteActionCopy(targetType: string): DeleteActionCopy | null {
  if (targetType === "post") return POST_DELETE_COPY;
  if (targetType === "comment") return COMMENT_DELETE_COPY;
  if (targetType === "activity") return ACTIVITY_CANCEL_COPY;
  return null;
}

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
  }

  function cancelForm(reportId: string): void {
    setOpenFormRowId((current) => (current === reportId ? null : current));
    setOpenFormAction(null);
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

  const statusFilter = (
    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
      状态
      <select
        value={status}
        onChange={(event) => handleStatusChange(event.target.value)}
        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {STATUS_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const partialFailureBanner = partialFailureMessage ? (
    <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {partialFailureMessage}
    </p>
  ) : null;

  if (isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <AdminNav />
        <h1 className="mb-4 text-xl font-bold text-text">举报处理</h1>
        {statusFilter}
        {partialFailureBanner}
        <p role="status" className="text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <AdminNav />
        <h1 className="mb-4 text-xl font-bold text-text">举报处理</h1>
        {statusFilter}
        {partialFailureBanner}
        <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          举报加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  const visibleReports = reports ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <AdminNav />
      <h1 className="mb-4 text-xl font-bold text-text">举报处理</h1>
      {statusFilter}
      {partialFailureBanner}
      {visibleReports.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">暂无举报</p>
      ) : (
        <ul>
          {visibleReports.map((report) => {
            const isActioning = actioningReportId === report.id;
            const isFormOpen = openFormRowId === report.id;

            return (
              <li key={report.id} className="mb-2 rounded-lg border border-border bg-white p-4">
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
                {isFormOpen ? null : (
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
                  </div>
                )}
                {isFormOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {validationErrors[report.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {validationErrors[report.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      处理说明
                      <input
                        type="text"
                        value={noteDrafts[report.id] ?? ""}
                        onChange={(event) =>
                          setNoteDrafts((prev) => ({
                            ...prev,
                            [report.id]: event.target.value
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    {(() => {
                      const deleteCopy = getDeleteActionCopy(report.targetType);
                      if (!deleteCopy) return null;

                      return (
                        <div>
                          <label className="mb-2 flex items-center gap-2 text-sm text-text">
                            <input
                              type="checkbox"
                              checked={deleteChecked[report.id] ?? false}
                              onChange={(event) =>
                                setDeleteChecked((prev) => ({
                                  ...prev,
                                  [report.id]: event.target.checked
                                }))
                              }
                              disabled={isActioning}
                              className="accent-primary"
                            />
                            {deleteCopy.checkboxLabel}
                          </label>
                          {deleteChecked[report.id] ? (
                            <>
                              {deleteValidationErrors[report.id] ? (
                                <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                                  {deleteValidationErrors[report.id]}
                                </p>
                              ) : null}
                              <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                                {deleteCopy.reasonLabel}
                                <input
                                  type="text"
                                  value={deleteReasonDrafts[report.id] ?? ""}
                                  onChange={(event) =>
                                    setDeleteReasonDrafts((prev) => ({
                                      ...prev,
                                      [report.id]: event.target.value
                                    }))
                                  }
                                  disabled={isActioning}
                                  className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </label>
                            </>
                          ) : null}
                        </div>
                      );
                    })()}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() =>
                          handleConfirm(report.id, openFormAction as PendingAction)
                        }
                        className={
                          openFormAction === "resolve"
                            ? "rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                            : "rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                        }
                      >
                        {openFormAction === "resolve" ? "确认标记已处理" : "确认驳回举报"}
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelForm(report.id)}
                        className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
