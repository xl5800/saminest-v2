import { useState } from "react";
import { Link } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useMyBlockedUsersQuery } from "../../features/blocks/use-my-blocked-users-query";
import { useUnblockUserMutation } from "../../features/blocks/use-unblock-user-mutation";
import type { BlockedUserListItem } from "../../repositories/user-blocks-repository";
import { useAuthStore } from "../../store/auth-store";

const EMPTY_LIST_MESSAGE = "暂无屏蔽的用户";
const LOAD_ERROR_MESSAGE = "加载失败，请稍后重试。";
const UNBLOCK_ERROR_MESSAGE = "取消屏蔽失败，请稍后重试。";

interface BlockedUserRowProps {
  blockerId: string;
  user: BlockedUserListItem;
}

/**
 * 单独抽成一个小组件，让"取消屏蔽"这个 mutation 的 isPending/错误状态各自
 * 独立在每一行——跟 favorite-button.tsx（收藏按钮各自调用一次
 * useToggleFavoriteMutation，不共用一份 mutation 实例）是同一个理由：
 * 页面级别不需要一个"当前正在处理哪一行"的共享 state（跟
 * reports-page.tsx/users-page.tsx 那种"一次只能展开一行处理表单"的场景
 * 不一样，这里每一行都是独立、随时可点的按钮），点一行的"取消屏蔽"不会
 * 影响其它行按钮的可用性。
 *
 * 头像/昵称包一层 Link 指向 /users/:userId（复用现成的
 * user-profile-page.tsx，不新建页面），"取消屏蔽"按钮不在这个 Link 里面，
 * 是同一行内并列的另一个可点区域，点它不会触发导航。
 */
function BlockedUserRow({ blockerId, user }: BlockedUserRowProps) {
  const unblockMutation = useUnblockUserMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleUnblock(): Promise<void> {
    if (unblockMutation.isPending) return;

    setError(null);
    try {
      await unblockMutation.mutateAsync({ blockerId, blockedId: user.blockedUserId });
    } catch {
      setError(UNBLOCK_ERROR_MESSAGE);
    }
  }

  const avatarInitial = user.displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-border bg-white p-4">
      <Link to={`/users/${user.blockedUserId}`} className="flex min-w-0 items-center gap-3">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-sm font-semibold text-text-muted"
          >
            {avatarInitial}
          </span>
        )}
        <span className="truncate text-sm font-medium text-text">{user.displayName}</span>
      </Link>
      <div className="shrink-0 text-right">
        <button
          type="button"
          onClick={() => void handleUnblock()}
          disabled={unblockMutation.isPending}
          className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {unblockMutation.isPending ? "处理中…" : "取消屏蔽"}
        </button>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * "已屏蔽"管理页（/blocked-users），13 号卡新增——"我的"页功能列表"设置"
 * 上面那一行的跳转目标。路由已在 routes.tsx 用 RequireAuth 包裹，页面
 * 内部不做登录检查/跳转，符合 CLAUDE.md 的统一规则。26 号卡（18 条旧
 * AppHeader 路由统一迁移到 TopBar）：改用 TopBar 的 nav-only 变体（带
 * title="已屏蔽"，不带品牌名/发布按钮），返回按钮仍然是默认的
 * navigate(-1)——跟迁移前全局 AppHeader 的返回行为完全一致，这个路由也
 * 随之加进了 app-shell.tsx 的 TOPBAR_MIGRATED_PATTERNS。
 *
 * 数据来自新增的 useMyBlockedUsersQuery（见该 hook 和
 * user-blocks-repository.ts 的 listMyBlockedUsers 的注释）。"取消屏蔽"
 * 复用现成的 useUnblockUserMutation——那个 mutation 的 onSuccess 已经在
 * 13 号卡这次改动里顺带加了对 ["my-blocked-users", blockerId] 的
 * invalidateQueries（见该文件注释），这个页面因此完全不需要自己维护一份
 * "取消屏蔽成功后从本地列表移除这一行"的 state，成功后底层查询自动重新
 * 拉取、少了这一行，是数据库当前状态的真实反映，不是前端本地拼出来的
 * 临时视图。
 */
export function BlockedUsersPage() {
  const currentUserId = useAuthStore((s) => s.session)?.user.id;
  const { data: blockedUsers, isPending, isError } = useMyBlockedUsersQuery(currentUserId);

  if (isPending) {
    return (
      <main>
        <TopBar variant="nav-only" title="已屏蔽" />
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <TopBar variant="nav-only" title="已屏蔽" />
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {LOAD_ERROR_MESSAGE}
          </p>
        </div>
      </main>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <main>
        <TopBar variant="nav-only" title="已屏蔽" />
        <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
          <p role="status" className="text-sm text-text-muted">{EMPTY_LIST_MESSAGE}</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <TopBar variant="nav-only" title="已屏蔽" />
      <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
        <ul className="flex flex-col gap-2">
          {blockedUsers.map((user) => (
            <BlockedUserRow
              key={user.blockedUserId}
              blockerId={currentUserId as string}
              user={user}
            />
          ))}
        </ul>
      </div>
    </main>
  );
}
