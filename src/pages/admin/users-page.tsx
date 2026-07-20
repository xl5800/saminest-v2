import { type FormEvent, useEffect, useState } from "react";

import { useAdminUsersQuery } from "../../features/admin/use-admin-users-query";
import { useSetAccountStatusMutation } from "../../features/admin/use-set-account-status-mutation";
import type { AdminProfileListItem } from "../../repositories/profiles-repository";
import { useAuthStore } from "../../store/auth-store";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const REASON_REQUIRED_MESSAGE = "请填写原因。";

// 跟 all-posts-page.tsx 的 STATUS_LABELS 是同一个"给数据库枚举值配中文文案"
// 的惯例。deleted 这次任务范围内不会出现在这份列表里（list_profiles_for_admin
// 已经排除了 deleted_at 不为空的账号，见对应迁移文件），这里仍然带上这个
// 取值只是为了 fallback 更完整，不代表这次任务往 UI 里引入了"已注销"这个
// 状态概念。
const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "正常",
  restricted: "受限",
  suspended: "已封禁",
  deleted: "已注销"
};

type StatusAction = "restricted" | "suspended" | "active";

const ACTION_LABELS: Record<StatusAction, string> = {
  restricted: "设为受限",
  suspended: "设为封禁",
  active: "恢复正常"
};

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 管理员账号管理页面（/admin/users）。整体结构（本地列表只在第一次拿到
 * 服务端数据时同步一次、每行独立维护展开/草稿/校验错误/进行中状态）跟
 * pending-posts-page.tsx / all-posts-page.tsx / reports-page.tsx 保持
 * 同样的模式。
 *
 * 跟那几个"处理队列"页面刻意不同的一点：设置账号状态成功后不会把这一行从
 * 列表里移除，只更新这一行显示的 accountStatus。这是"账号管理列表"和
 * "待处理队列"两种页面的本质区别——待审核帖子/待处理举报处理完之后就
 * 不应该再出现在队列里（队列的意义就是"处理到清空"），但一个用户被设成
 * restricted/suspended 之后仍然是平台上的一个账号，管理员大概率还需要
 * 继续在这个列表里看到他、以后可能还要再把他改回 active，把这一行整个
 * 移除反而会让管理员找不到人。
 *
 * 自我操作防护：当前登录管理员自己那一行不渲染任何操作按钮（不是禁用，
 * 直接不渲染，避免误导管理员以为点了会有效）。这是前端这一侧的纵深防御，
 * 真正的强制在数据库 set_account_status() 函数内部（target_user_id =
 * auth.uid() 时函数会 raise exception 拒绝）。
 *
 * 每行只展示"当前状态之外"的两个操作按钮（比如已经是 restricted 的账号
 * 不再显示"设为受限"），避免一次没有意义的点击——RPC 本身也会在状态没有
 * 变化时拒绝（"already has account_status ..."），这里只是提前把这类
 * 点不出结果的按钮藏起来，不是唯一的保护层。
 */
export function AdminUsersPage() {
  const currentUserId = useAuthStore((s) => s.session)?.user.id;

  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState<string | undefined>(undefined);
  const { data, isPending, isError } = useAdminUsersQuery(searchTerm);
  const setStatusMutation = useSetAccountStatusMutation();

  const [users, setUsers] = useState<AdminProfileListItem[] | null>(null);
  const [actioningUserId, setActioningUserId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [openFormRowId, setOpenFormRowId] = useState<string | null>(null);
  const [openFormAction, setOpenFormAction] = useState<StatusAction | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data && users === null) {
      setUsers(data);
    }
  }, [data, users]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = searchInput.trim();
    setSearchTerm(trimmed === "" ? undefined : trimmed);
    // 搜索词变化相当于切到一份新的查询缓存（不同 queryKey），本地列表和
    // 所有行内展开/草稿状态都要跟着重置，否则会在新的搜索结果下继续展示
    // 上一次搜索留下的行内 UI 状态，跟 all-posts-page.tsx 的
    // handleStatusFilterChange 是同一个原因。
    setUsers(null);
    setOpenFormRowId(null);
    setOpenFormAction(null);
    setRowErrors({});
    setValidationErrors({});
    setReasonDrafts({});
  }

  function updateUserStatus(userId: string, newStatus: StatusAction): void {
    setUsers((prev) =>
      (prev ?? []).map((user) =>
        user.id === userId ? { ...user, accountStatus: newStatus } : user
      )
    );
  }

  function openForm(userId: string, action: StatusAction): void {
    setOpenFormRowId(userId);
    setOpenFormAction(action);
    setValidationErrors((prev) => withoutKey(prev, userId));
    setRowErrors((prev) => withoutKey(prev, userId));
  }

  function cancelForm(userId: string): void {
    setOpenFormRowId((current) => (current === userId ? null : current));
    setOpenFormAction(null);
  }

  async function handleConfirm(userId: string, action: StatusAction): Promise<void> {
    const reason = (reasonDrafts[userId] ?? "").trim();
    if (!reason) {
      setValidationErrors((prev) => ({ ...prev, [userId]: REASON_REQUIRED_MESSAGE }));
      return;
    }

    setValidationErrors((prev) => withoutKey(prev, userId));
    setRowErrors((prev) => withoutKey(prev, userId));
    setActioningUserId(userId);
    try {
      await setStatusMutation.mutateAsync({ userId, newStatus: action, reason });
      updateUserStatus(userId, action);
      setOpenFormRowId((current) => (current === userId ? null : current));
      setOpenFormAction(null);
      setReasonDrafts((prev) => withoutKey(prev, userId));
    } catch {
      // 提交失败时特意不清空 reasonDrafts，保留管理员已经输入的原因，跟
      // pending-posts-page.tsx / all-posts-page.tsx 一致的"失败不丢用户
      // 输入"原则。
      setRowErrors((prev) => ({ ...prev, [userId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningUserId(null);
    }
  }

  const searchForm = (
    <form onSubmit={handleSearchSubmit}>
      <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
        搜索昵称或邮箱
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      <button
        type="submit"
        className="ml-2 rounded bg-primary px-3 py-1 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        搜索
      </button>
    </form>
  );

  if (isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">账号管理</h1>
        {searchForm}
        <p role="status" className="text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
        <h1 className="mb-4 text-xl font-bold text-text">账号管理</h1>
        {searchForm}
        <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          用户加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  const visibleUsers = users ?? [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="mb-4 text-xl font-bold text-text">账号管理</h1>
      {searchForm}
      {visibleUsers.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">暂无用户</p>
      ) : (
        <ul>
          {visibleUsers.map((user) => {
            const isActioning = actioningUserId === user.id;
            const isFormOpen = openFormRowId === user.id;
            const isSelf = !!currentUserId && user.id === currentUserId;
            const availableActions = (
              Object.keys(ACTION_LABELS) as StatusAction[]
            ).filter((action) => action !== user.accountStatus);

            const statusVariant =
              user.accountStatus === "active"
                ? "bg-success/10 text-success"
                : user.accountStatus === "restricted"
                  ? "bg-warning/10 text-warning"
                  : user.accountStatus === "suspended"
                    ? "bg-danger/10 text-danger"
                    : "bg-bg text-text-muted";
            const actionButtonClassName: Record<StatusAction, string> = {
              restricted:
                "rounded border border-warning px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60",
              suspended:
                "rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60",
              active:
                "rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            };

            return (
              <li key={user.id} className="mb-2 rounded-lg border border-border bg-white p-4">
                <span className="mr-3 text-sm text-text">{user.displayName}</span>
                <span className="mr-3 text-sm text-text-muted">{user.email}</span>
                <span className="mr-3 text-sm text-text-muted">{user.role}</span>
                <span className={`mr-3 rounded-full px-2 py-0.5 text-xs font-medium ${statusVariant}`}>
                  {ACCOUNT_STATUS_LABELS[user.accountStatus] ?? user.accountStatus}
                </span>
                {rowErrors[user.id] ? (
                  <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[user.id]}
                  </p>
                ) : null}
                {isSelf ? null : isFormOpen ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availableActions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={isActioning}
                        onClick={() => openForm(user.id, action)}
                        className={actionButtonClassName[action]}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    ))}
                  </div>
                )}
                {isSelf ? null : isFormOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {validationErrors[user.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {validationErrors[user.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      原因
                      <input
                        type="text"
                        value={reasonDrafts[user.id] ?? ""}
                        onChange={(event) =>
                          setReasonDrafts((prev) => ({
                            ...prev,
                            [user.id]: event.target.value
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() =>
                          handleConfirm(user.id, openFormAction as StatusAction)
                        }
                        className={actionButtonClassName[openFormAction as StatusAction]}
                      >
                        确认{ACTION_LABELS[openFormAction as StatusAction]}
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelForm(user.id)}
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
