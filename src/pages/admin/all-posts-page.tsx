import { useEffect, useState } from "react";

import { AdminNav } from "../../components/admin-nav";
import { TopBar } from "../../components/top-bar";
import { useAllActivitiesForAdminQuery } from "../../features/admin/use-all-activities-for-admin-query";
import { useAdminCancelActivityMutation } from "../../features/admin/use-admin-cancel-activity-mutation";
import { useAdminDeleteActivityMutation } from "../../features/admin/use-admin-delete-activity-mutation";
import { useAllPostsQuery } from "../../features/admin/use-all-posts-query";
import { useDeletePostMutation } from "../../features/admin/use-delete-post-mutation";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import type { AdminActivityListItem } from "../../repositories/activities-repository";
import type { AdminPostListItem } from "../../repositories/posts-repository";
import { useDebouncedValue } from "../../utils/use-debounced-value";
import { formatPublishedAt } from "../../utils/format";

const GENERIC_ERROR_MESSAGE = "操作失败，请稍后重试。";
const DELETE_REASON_REQUIRED_MESSAGE = "请填写删除原因。";
const CANCEL_REASON_REQUIRED_MESSAGE = "请填写下架原因。";

// value === "" 表示"全部"，不带 status 过滤条件传给 listAllPosts；其余取值
// 是产品明确要求的三个可选项（pending/approved/rejected）。
const STATUS_FILTER_OPTIONS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" }
] as const;

// 覆盖 posts.status 约束里现实中会出现的所有取值（不止过滤器上那三个可选
// 项——过滤器只暴露产品要求的三个，但列表本身默认"全部"时 draft/archived
// 的帖子也会出现在行里，标签要能覆盖到，不能显示成裸的英文枚举值）。
const STATUS_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已驳回",
  draft: "草稿",
  archived: "已归档"
};

// activities.status 的取值（open/full/cancelled/ended）跟帖子完全不是
// 同一套体系，单独维护一份文案+配色映射，不跟 STATUS_LABELS/上面的
// statusVariant 混用——见任务卡"这次不做活动的状态筛选"的说明，这里只是
// 展示徽章，不是筛选选项。
const ACTIVITY_STATUS_LABELS: Record<string, string> = {
  open: "进行中",
  full: "已满员",
  cancelled: "已下架",
  ended: "已结束"
};

function activityStatusVariant(status: string): string {
  if (status === "open") return "bg-success/10 text-success";
  if (status === "full") return "bg-warning/10 text-warning";
  if (status === "cancelled") return "bg-danger/10 text-danger";
  return "bg-bg text-text-muted";
}

// "找搭子"分类不对应 categories 表任何一行，是前端自己定义的特殊筛选值，
// 用来把整个数据源切到 useAllActivitiesForAdminQuery。用一个不可能是真实
// uuid 的字符串常量，不会跟任何真实 category.id 冲突。
const ACTIVITIES_FILTER_VALUE = "__activities__";

// 搜索框防抖间隔——跟首页/分类页搜索框的防抖时长保持一致，不发明一个新的
// 数值，见 use-debounced-value.ts。
const SEARCH_DEBOUNCE_MS = 300;

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * 管理员"全部帖子"管理列表（/admin/posts/all）。跟 pending-posts-page.tsx
 * 是两个独立页面，故意不合并：那边是"待审核队列"（oldest-first，处理完
 * 就从队列消失，产品要求"最早发的先处理"）；这边是面向已经上线运营的
 * "浏览/管理所有帖子"（listAllPosts newest-first，可按状态筛选，每行只有
 * 一个"删除"动作）。
 *
 * "全部帖子"管理页扩展成能管理所有内容任务卡：BARRY 明确要求不新建一个
 * 独立的"全部找搭子"页面，而是扩展这个页面——新增一个分类筛选（真实分类
 * 从 useCategoriesQuery() 动态拿，"找搭子"是前端自己定义的第 4 个特殊
 * 选项，选中后整个数据源从 useAllPostsQuery 切到
 * useAllActivitiesForAdminQuery），配合一个防抖搜索框，在同一个页面里
 * 管理所有帖子和活动。"状态"筛选只在没选中"找搭子"时展示——活动的状态
 * 取值（open/full/cancelled/ended）跟帖子完全不是一回事，这次不做活动的
 * 状态筛选。
 *
 * 两套本地列表状态（posts/activities）分开维护，同一时刻只有一个在用——
 * 跟原来"服务端数据只在第一次拿到时同步进本地 state"的模式一致，只是现在
 * 按当前数据源分别同步。行内操作共用一套"删除"表单状态
 * （openDeleteRowId/deleteReasons/deleteValidationErrors/actioningId）——
 * 帖子的删除和活动的删除虽然背后是两个不同的 mutation，但同一时刻只会
 * 展示其中一种行，不会有 id 冲突或"分不清是哪种删除"的问题。活动行
 * 额外的"下架"动作是完全独立的第二套表单状态（openCancelRowId/
 * cancelReasons/cancelValidationErrors）——这是任务卡明确要求的：不能让
 * "下架"和"删除"共享同一个 openDeleteRowId，否则没法同时看清一行现在
 * 展开的到底是哪个表单。
 *
 * 切换分类/搜索词都要把本地列表状态、两套行内表单状态一并重置——照抄现有
 * handleStatusFilterChange 的模式（切换过滤器相当于切到一份新的查询缓存，
 * 不重置的话会在新条件下继续展示上一个条件下的旧行/旧表单）。
 */
export function AdminAllPostsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const debouncedSearchQuery = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  const isActivitiesView = categoryFilter === ACTIVITIES_FILTER_VALUE;
  const trimmedSearchQuery = debouncedSearchQuery.trim();

  const { data: categories } = useCategoriesQuery();

  const {
    data: postsData,
    isPending: isPostsPending,
    isError: isPostsError
  } = useAllPostsQuery(
    statusFilter === "" ? undefined : statusFilter,
    categoryFilter === "" || isActivitiesView ? undefined : categoryFilter,
    trimmedSearchQuery === "" ? undefined : trimmedSearchQuery
  );
  const {
    data: activitiesData,
    isPending: isActivitiesPending,
    isError: isActivitiesError
  } = useAllActivitiesForAdminQuery(
    trimmedSearchQuery === "" ? undefined : trimmedSearchQuery
  );

  const deletePostMutation = useDeletePostMutation();
  const deleteActivityMutation = useAdminDeleteActivityMutation();
  const cancelActivityMutation = useAdminCancelActivityMutation();

  const [posts, setPosts] = useState<AdminPostListItem[] | null>(null);
  const [activities, setActivities] = useState<AdminActivityListItem[] | null>(null);

  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const [openDeleteRowId, setOpenDeleteRowId] = useState<string | null>(null);
  const [deleteReasons, setDeleteReasons] = useState<Record<string, string>>({});
  const [deleteValidationErrors, setDeleteValidationErrors] = useState<
    Record<string, string>
  >({});

  // 活动"下架"独立的一套表单状态——不跟上面的删除表单共享，见组件顶部
  // 注释。
  const [openCancelRowId, setOpenCancelRowId] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [cancelValidationErrors, setCancelValidationErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (postsData && posts === null) {
      setPosts(postsData);
    }
  }, [postsData, posts]);

  useEffect(() => {
    if (activitiesData && activities === null) {
      setActivities(activitiesData);
    }
  }, [activitiesData, activities]);

  // 防抖后的搜索词真正变化时（不是每次敲键），把两份本地列表状态都重置
  // 回 null——理由跟 handleCategoryFilterChange 一样：posts/activities
  // 一旦被同步过一次就不会再自动跟着新的查询结果更新（见上面两个
  // useEffect 的"只在本地列表是 null 时才同步"这个守卫条件），如果不在
  // 这里也重置一次，搜索框防抖生效、真的发出了新的过滤请求之后，本地列表
  // 却会一直停留在过滤之前的旧结果上，页面显示跟请求实际返回的数据对
  // 不上。这个 effect 依赖 trimmedSearchQuery（防抖后的值），不是
  // searchInput（每次敲键都变的即时值），所以不会在打字过程中反复触发。
  useEffect(() => {
    setPosts(null);
    setActivities(null);
    resetRowLevelState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedSearchQuery]);

  function resetRowLevelState(): void {
    setOpenDeleteRowId(null);
    setOpenCancelRowId(null);
    setRowErrors({});
    setDeleteValidationErrors({});
    setDeleteReasons({});
    setCancelValidationErrors({});
    setCancelReasons({});
  }

  function handleStatusFilterChange(nextStatus: string): void {
    setStatusFilter(nextStatus);
    setPosts(null);
    resetRowLevelState();
  }

  function handleCategoryFilterChange(nextCategory: string): void {
    setCategoryFilter(nextCategory);
    // 分类切换的方向可能是"帖子分类 -> 找搭子""找搭子 -> 帖子分类""帖子
    // 分类 -> 另一个帖子分类"——不管哪个方向，两份本地列表都重置最简单、
    // 最不容易漏：切走的那一份反正也用不上了，切回来时会因为对应的
    // queryKey 没变、posts/activities 已经是 null 而重新从 data 同步一次
    // （如果 TanStack Query 缓存还在，直接命中缓存，不会多发请求）。
    setPosts(null);
    setActivities(null);
    resetRowLevelState();
  }

  function handleSearchInputChange(nextValue: string): void {
    setSearchInput(nextValue);
  }

  function removePost(postId: string): void {
    setPosts((prev) => (prev ?? []).filter((post) => post.id !== postId));
  }

  function removeActivity(activityId: string): void {
    setActivities((prev) => (prev ?? []).filter((activity) => activity.id !== activityId));
  }

  function openDeleteForm(id: string): void {
    setOpenDeleteRowId(id);
    setDeleteValidationErrors((prev) => withoutKey(prev, id));
    setRowErrors((prev) => withoutKey(prev, id));
  }

  function cancelDeleteForm(id: string): void {
    setOpenDeleteRowId((current) => (current === id ? null : current));
  }

  function openCancelForm(id: string): void {
    setOpenCancelRowId(id);
    setCancelValidationErrors((prev) => withoutKey(prev, id));
    setRowErrors((prev) => withoutKey(prev, id));
  }

  function cancelCancelForm(id: string): void {
    setOpenCancelRowId((current) => (current === id ? null : current));
  }

  async function handleConfirmDelete(id: string): Promise<void> {
    const reason = (deleteReasons[id] ?? "").trim();
    if (!reason) {
      setDeleteValidationErrors((prev) => ({ ...prev, [id]: DELETE_REASON_REQUIRED_MESSAGE }));
      return;
    }

    setDeleteValidationErrors((prev) => withoutKey(prev, id));
    setRowErrors((prev) => withoutKey(prev, id));
    setActioningId(id);
    try {
      if (isActivitiesView) {
        await deleteActivityMutation.mutateAsync({ activityId: id, deleteReason: reason });
        removeActivity(id);
      } else {
        await deletePostMutation.mutateAsync({ postId: id, deleteReason: reason });
        removePost(id);
      }
      setOpenDeleteRowId((current) => (current === id ? null : current));
      setDeleteReasons((prev) => withoutKey(prev, id));
    } catch {
      // 提交失败时特意不清空 deleteReasons，保留管理员已经输入的删除原因，
      // 跟 pending-posts-page.tsx 的驳回原因、reports-page.tsx 的处理说明
      // 是同一个"失败不丢用户输入"原则。
      setRowErrors((prev) => ({ ...prev, [id]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningId(null);
    }
  }

  async function handleConfirmCancel(activityId: string): Promise<void> {
    const reason = (cancelReasons[activityId] ?? "").trim();
    if (!reason) {
      setCancelValidationErrors((prev) => ({
        ...prev,
        [activityId]: CANCEL_REASON_REQUIRED_MESSAGE
      }));
      return;
    }

    setCancelValidationErrors((prev) => withoutKey(prev, activityId));
    setRowErrors((prev) => withoutKey(prev, activityId));
    setActioningId(activityId);
    try {
      await cancelActivityMutation.mutateAsync({ activityId, cancelReason: reason });
      setActivities((prev) =>
        (prev ?? []).map((activity) =>
          activity.id === activityId ? { ...activity, status: "cancelled" } : activity
        )
      );
      setOpenCancelRowId((current) => (current === activityId ? null : current));
      setCancelReasons((prev) => withoutKey(prev, activityId));
    } catch {
      setRowErrors((prev) => ({ ...prev, [activityId]: GENERIC_ERROR_MESSAGE }));
    } finally {
      setActioningId(null);
    }
  }

  const categoryFilterControl = (
    <label className="mb-4 ml-4 inline-flex items-center gap-2 text-sm font-medium text-text">
      分类
      <select
        value={categoryFilter}
        onChange={(event) => handleCategoryFilterChange(event.target.value)}
        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">全部帖子</option>
        {(categories ?? []).map((category) => (
          <option key={category.id} value={category.id}>
            {category.nameZh}
          </option>
        ))}
        <option value={ACTIVITIES_FILTER_VALUE}>找搭子</option>
      </select>
    </label>
  );

  const statusFilterControl = isActivitiesView ? null : (
    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
      状态
      <select
        value={statusFilter}
        onChange={(event) => handleStatusFilterChange(event.target.value)}
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

  const searchControl = (
    <label className="mb-4 ml-4 inline-flex items-center gap-2 text-sm font-medium text-text">
      搜索
      <input
        type="text"
        value={searchInput}
        onChange={(event) => handleSearchInputChange(event.target.value)}
        placeholder="按标题搜索…"
        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );

  const isPending = isActivitiesView ? isActivitiesPending : isPostsPending;
  const isError = isActivitiesView ? isActivitiesError : isPostsError;

  if (isPending) {
    return (
      <main>
        <TopBar variant="nav-only" title="全部帖子" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          {statusFilterControl}
          {categoryFilterControl}
          {searchControl}
          <p role="status" className="text-sm text-text-muted">加载中…</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <TopBar variant="nav-only" title="全部帖子" />
        <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
          <AdminNav />
          {statusFilterControl}
          {categoryFilterControl}
          {searchControl}
          <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {isActivitiesView ? "活动加载失败，请稍后重试。" : "帖子加载失败，请稍后重试。"}
          </p>
        </div>
      </main>
    );
  }

  const visiblePosts = posts ?? [];
  const visibleActivities = activities ?? [];
  const isEmpty = isActivitiesView ? visibleActivities.length === 0 : visiblePosts.length === 0;

  return (
    <main>
      <TopBar variant="nav-only" title="全部帖子" />
      <div className="mx-auto max-w-4xl px-4 py-6 pb-20 md:pb-6">
      <AdminNav />
      {statusFilterControl}
      {categoryFilterControl}
      {searchControl}
      {isEmpty ? (
        <p role="status" className="text-sm text-text-muted">
          {isActivitiesView ? "暂无找搭子活动" : "暂无帖子"}
        </p>
      ) : isActivitiesView ? (
        <ul>
          {visibleActivities.map((activity) => {
            const isActioning = actioningId === activity.id;
            const isDeleteFormOpen = openDeleteRowId === activity.id;
            const isCancelFormOpen = openCancelRowId === activity.id;
            const isAlreadyCancelled = activity.status === "cancelled";

            return (
              <li key={activity.id} className="mb-2 rounded-lg border border-border bg-card p-4">
                <span className="mr-3 break-words text-sm text-text">{activity.title}</span>
                <span className="mr-3 break-words text-sm text-text-muted">{activity.organizerName}</span>
                <span className="mr-3 rounded-full bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                  找搭子
                </span>
                <span
                  className={`mr-3 rounded-full px-2 py-0.5 text-xs font-medium ${activityStatusVariant(activity.status)}`}
                >
                  {ACTIVITY_STATUS_LABELS[activity.status] ?? activity.status}
                </span>
                <span className="mr-3 text-sm text-text-muted">{formatPublishedAt(activity.createdAt)}</span>
                {rowErrors[activity.id] ? (
                  <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[activity.id]}
                  </p>
                ) : null}
                {isDeleteFormOpen || isCancelFormOpen ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isActioning || isAlreadyCancelled}
                      onClick={() => openCancelForm(activity.id)}
                      className="rounded border border-warning px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      下架
                    </button>
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openDeleteForm(activity.id)}
                      className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      删除
                    </button>
                  </div>
                )}
                {isCancelFormOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {cancelValidationErrors[activity.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {cancelValidationErrors[activity.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      下架原因
                      <input
                        type="text"
                        value={cancelReasons[activity.id] ?? ""}
                        onChange={(event) =>
                          setCancelReasons((prev) => ({
                            ...prev,
                            [activity.id]: event.target.value
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => handleConfirmCancel(activity.id)}
                        className="rounded border border-warning px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        确认下架
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelCancelForm(activity.id)}
                        className="rounded border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
                {isDeleteFormOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {deleteValidationErrors[activity.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {deleteValidationErrors[activity.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      删除原因
                      <input
                        type="text"
                        value={deleteReasons[activity.id] ?? ""}
                        onChange={(event) =>
                          setDeleteReasons((prev) => ({
                            ...prev,
                            [activity.id]: event.target.value
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => handleConfirmDelete(activity.id)}
                        className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelDeleteForm(activity.id)}
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
      ) : (
        <ul>
          {visiblePosts.map((post) => {
            const isActioning = actioningId === post.id;
            const isDeleteFormOpen = openDeleteRowId === post.id;
            const statusVariant =
              post.status === "approved"
                ? "bg-success/10 text-success"
                : post.status === "pending"
                  ? "bg-warning/10 text-warning"
                  : post.status === "rejected"
                    ? "bg-danger/10 text-danger"
                    : "bg-bg text-text-muted";

            return (
              <li key={post.id} className="mb-2 rounded-lg border border-border bg-card p-4">
                <span className="mr-3 break-words text-sm text-text">{post.title}</span>
                <span className="mr-3 break-words text-sm text-text-muted">{post.authorName}</span>
                <span className="mr-3 text-sm text-text-muted">{post.categoryName}</span>
                <span className={`mr-3 rounded-full px-2 py-0.5 text-xs font-medium ${statusVariant}`}>
                  {STATUS_LABELS[post.status] ?? post.status}
                </span>
                <span className="mr-3 text-sm text-text-muted">{formatPublishedAt(post.createdAt)}</span>
                {rowErrors[post.id] ? (
                  <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                    {rowErrors[post.id]}
                  </p>
                ) : null}
                {isDeleteFormOpen ? null : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isActioning}
                      onClick={() => openDeleteForm(post.id)}
                      className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      删除
                    </button>
                  </div>
                )}
                {isDeleteFormOpen ? (
                  <div className="mt-3 rounded border border-border bg-bg p-3">
                    {deleteValidationErrors[post.id] ? (
                      <p role="alert" className="mb-2 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                        {deleteValidationErrors[post.id]}
                      </p>
                    ) : null}
                    <label className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text">
                      删除原因
                      <input
                        type="text"
                        value={deleteReasons[post.id] ?? ""}
                        onChange={(event) =>
                          setDeleteReasons((prev) => ({
                            ...prev,
                            [post.id]: event.target.value
                          }))
                        }
                        disabled={isActioning}
                        className="rounded border border-border px-2 py-1 text-base text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => handleConfirmDelete(post.id)}
                        className="rounded border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => cancelDeleteForm(post.id)}
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
      </div>
    </main>
  );
}
