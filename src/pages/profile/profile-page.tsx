import { Ban, MessageSquare, Settings, Shield, Users, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { formatShortRegionLabel } from "../../data/us-states";
import { useMyJoinedActivitiesQuery } from "../../features/activities/use-my-joined-activities-query";
import { useMyOrganizedActivitiesQuery } from "../../features/activities/use-my-organized-activities-query";
import { useFavoritePostIdsQuery } from "../../features/favorites/use-favorite-post-ids-query";
import { useMyPostsQuery } from "../../features/my-posts/use-my-posts-query";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { USER_PROFILE_PAGE_ENABLED } from "../../config/feature-flags";
import { usePendingActivityParticipantsCountQuery } from "../../features/activities/use-has-pending-activity-participants-query";
import { useIsAdminQuery } from "../../features/admin/use-is-admin-query";
import { useContactSupport } from "../../features/conversations/use-contact-support";
import { useMyProfileQuery } from "../../features/profile/use-my-profile-query";
import { useAuthStore } from "../../store/auth-store";

/**
 * "设置"入口的目标路径——06 号卡当初挂在 TopBar 右上角的齿轮图标上，
 * 11 号卡把整个 TopBar 都拆掉了，这个常量本身不用改（routes.tsx 里已经
 * 是真正的 /settings 页面，不再是占位路由），只是现在从分组卡片里的一行
 * 触发，不再是顶栏图标按钮触发。
 */
const SETTINGS_PATH = "/settings";

/**
 * 24 号卡（"我的"页面改版）新增：分组卡片里的一行——跟改版前的
 * SettingsRow 是同一个"图标+文案+chevron"结构，区别是这一行不再自带
 * 圆角/白底/阴影/下外边距（那些现在由 GroupCard 统一套在整组外面），
 * 行与行之间的分隔线也是 GroupCard 用 divide-y 统一处理，不是每一行各自
 * 加 border-bottom。
 */
interface GroupRowProps {
  /** 静态路由目标，跟 onClick 二选一——传了 to 就渲染成 <Link>（原有的
   *  唯一形态，行为不变）。 */
  to?: string;
  /** 联系客服改成真聊天任务卡新增：传了 onClick 就渲染成 <button>，给
   *  "帮助与客服"这一行用——目标不再是一个固定路由，要先调用
   *  get_or_create_own_system_conversation() 拿到会话 id 再跳转，不能用
   *  静态的 <Link to="...">。这个组件只有这两种调用方式，不强制用 TS
   *  联合类型把 to/onClick 做成互斥（多加一层类型体操换来的安全性对
   *  两个调用方来说不值得），调用方自己保证传且只传其中一个。 */
  onClick?: () => void;
  icon: LucideIcon;
  label: string;
  /** 审核入口红点任务卡：大于 0 时在 chevron 前面显示一个红色数量角标
   *  （目前只有"我的活动"这一行传，值是待处理的活动报名申请数）。 */
  badgeCount?: number;
}

function GroupRow({ to, onClick, icon: Icon, label, badgeCount }: GroupRowProps) {
  // 修复"帮助与客服"chevron 贴字/分隔线变短任务卡：上面那条"两者都是 flex
  // 天然撑满父级宽度"的假设对 <button> 不成立——表单控件（<button>/
  // <input>/<select>）有一条特殊的尺寸规则，即使设了 display: flex，宽度
  // 依然按内容算（intrinsic sizing），不会像 <div>/<a> 那样自动撑满父容器。
  // <button> 分支（"帮助与客服"这一行）因此比其它 <Link> 行窄，chevron
  // 贴着文字、下面 divide-y 画出的分隔线也跟着变短。补上 w-full 让
  // <button> 真正撑满卡片宽度；text-left 是保险起见一起加的（部分浏览器
  // <button> 默认 text-align: center，这里内容是两个 flex 子元素理论上不
  // 受影响，顺手加上不会有副作用）。两个 class 加在共用的 className 里
  // 对 <Link> 分支是 no-op——<Link> 本来就已经是撑满宽度的块级元素、
  // 默认左对齐，不会改变它现在的视觉效果。
  const className =
    "flex h-14 w-full items-center justify-between px-4 text-left text-base font-medium text-text transition-opacity hover:opacity-90";
  const content = (
    <>
      <span className="flex items-center gap-3">
        <Icon aria-hidden="true" size={20} className="shrink-0 text-text-muted" />
        <span>{label}</span>
      </span>
      <span className="flex items-center gap-2">
        {badgeCount && badgeCount > 0 ? (
          <span
            data-testid="group-row-badge"
            className="min-w-[20px] rounded-full bg-danger px-1.5 text-center text-xs font-semibold leading-5 text-white"
          >
            {badgeCount > 99 ? "99+" : badgeCount}
            <span className="sr-only"> 条待处理</span>
          </span>
        ) : null}
        <span aria-hidden="true" className="text-[18px] leading-none text-chevron">
          ›
        </span>
      </span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * 24 号卡新增：把若干 GroupRow 收进同一张白色圆角卡片——"我的内容"
 * （我的活动/已屏蔽）和"账号与服务"（帮助与客服/设置/后台管理）各自是
 * 一张。divide-y 在行之间画分隔线，overflow-hidden 保证子行不会盖住卡片
 * 自己的圆角（子行本身是矩形，没有裁切的话直角会露在圆角外面，跟
 * activity-card.tsx 处理方形头像格铺满卡片时用的是同一个理由）。
 *
 * 全 App 视觉 Token 体系（第二批）：分隔线从 divide-border 换成
 * divide-divider——这是"行与行之间"的列表分割线场景（跟第一批
 * conversation-list-page.tsx 同一个语义），不是卡片自己的边框（这张卡片
 * 本身没有描边，只有 shadow-settings-item 投影），所以用专门的列表分割线
 * token，不是卡片边框 token。
 */
function GroupCard({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 divide-y divide-divider overflow-hidden rounded-2xl border border-border bg-card shadow-settings-item">
      {children}
    </div>
  );
}

/**
 * "我的"页（/profile）。
 *
 * 我的页改版（2026-10-25）：
 * - 顶部：大头像 + 昵称 + "地区 · 哪年加入"，右边"编辑资料"。
 * - 下面一排三个数字：我的发布 / 我的收藏 / 我的活动，点了进对应页面
 *   （数字直接用这三个页面本来就有的列表查询的条数，不另外查数量）。
 * - 菜单剩两组：我的社区发帖、已屏蔽；帮助与客服、设置（管理员多一个后台管理）。
 * - "退出登录"挪进设置页。
 */
export function ProfilePage() {
  const session = useAuthStore((s) => s.session);
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  const { data: profile, isPending, isError } = useMyProfileQuery();
  const { data: isAdmin } = useIsAdminQuery();
  const { data: pendingApprovalCount } = usePendingActivityParticipantsCountQuery();
  const { contactSupport, error: contactSupportError } = useContactSupport();
  const { data: myPosts } = useMyPostsQuery();
  const { data: favoritePostIds } = useFavoritePostIdsQuery();
  const { data: joinedActivities } = useMyJoinedActivitiesQuery();
  const { data: organizedActivities } = useMyOrganizedActivitiesQuery();

  const profileHref = session?.user.id && USER_PROFILE_PAGE_ENABLED ? `/users/${session.user.id}` : undefined;
  const displayName = profile?.displayName ?? "";
  const avatarInitial = displayName.trim().charAt(0).toUpperCase() || "?";
  const joinedYear = session?.user.created_at ? new Date(session.user.created_at).getFullYear() : null;
  const subtitle = [
    selectedRegion ? formatShortRegionLabel(selectedRegion) : null,
    joinedYear && !Number.isNaN(joinedYear) ? `${joinedYear} 年加入` : null
  ]
    .filter(Boolean)
    .join(" · ");
  const activityIds = new Set([
    ...(joinedActivities ?? []).map((activity) => activity.id),
    ...(organizedActivities ?? []).map((activity) => activity.id)
  ]);
  const stats: Array<{ to: string; label: string; count: number | undefined; badge?: number }> = [
    { to: "/my-posts", label: "我的发布", count: myPosts?.length },
    { to: "/favorites", label: "我的收藏", count: favoritePostIds?.length },
    {
      to: "/my-activities",
      label: "我的活动",
      count: joinedActivities && organizedActivities ? activityIds.size : undefined,
      badge: pendingApprovalCount
    }
  ];

  return (
    <main className="min-h-dvh pb-20 md:pb-6">
      <h1 className="sr-only">我的</h1>

      <div className="mx-auto max-w-md px-4 pb-6 pt-6">
        {isPending ? (
          <div role="status" className="mb-5 flex items-center gap-3.5">
            <span className="sr-only">加载中…</span>
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          </div>
        ) : null}
        {isError ? (
          <p role="alert" className="mb-5 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            用户信息加载失败，请稍后重试。
          </p>
        ) : null}

        {!isPending && !isError ? (
          <div className="mb-5">
            <div className="flex items-center gap-3.5">
              {/* 公开主页开着时，点头像 / 昵称去自己的主页（跟原来整张卡片可点一样）。 */}
              <Link
                to={profileHref ?? "/profile/edit"}
                aria-label={profileHref ? "查看个人主页" : undefined}
                className="flex min-w-0 flex-1 items-center gap-3.5"
              >
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-light text-2xl font-bold text-primary"
                  >
                    {avatarInitial}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[21px] font-bold text-text">{displayName || "未设置昵称"}</span>
                    {profile?.age ? (
                      <span className="shrink-0 rounded-full bg-field px-2 py-0.5 text-xs text-text-body">
                        {profile.age} 岁
                      </span>
                    ) : null}
                  </span>
                  {subtitle ? <span className="mt-0.5 block truncate text-[13px] text-text-muted">{subtitle}</span> : null}
                </span>
              </Link>
              <Link
                to="/profile/edit"
                className="flex h-8 shrink-0 items-center rounded-full border border-border px-3.5 text-[13px] text-text"
              >
                编辑资料
              </Link>
            </div>
            {profile?.bio ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-body">{profile.bio}</p>
            ) : null}
          </div>
        ) : null}

        <nav aria-label="我的发布、收藏和活动" className="mb-5 grid grid-cols-3 rounded-2xl bg-bg-secondary/60 py-3.5">
          {stats.map((stat, index) => (
            <Link
              key={stat.to}
              to={stat.to}
              className={`relative flex flex-col items-center ${index === 1 ? "border-x border-divider" : ""}`}
            >
              <span className="text-xl font-bold text-text">{stat.count ?? "–"}</span>
              <span className="text-[12.5px] text-text-muted">{stat.label}</span>
              {stat.badge && stat.badge > 0 ? (
                <span
                  data-testid="group-row-badge"
                  className="absolute -top-1 right-4 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[18px] text-white"
                >
                  {stat.badge > 99 ? "99+" : stat.badge}
                  <span className="sr-only"> 条待处理</span>
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <nav aria-label="我的内容">
          <GroupCard>
            <GroupRow to="/my-community-posts" icon={Users} label="我的社区发帖" />
            <GroupRow to="/blocked-users" icon={Ban} label="已屏蔽" />
          </GroupCard>
        </nav>

        <nav aria-label="账号与服务">
          <GroupCard>
            <GroupRow onClick={contactSupport} icon={MessageSquare} label="帮助与客服" />
            <GroupRow to={SETTINGS_PATH} icon={Settings} label="设置" />
            {isAdmin === true ? <GroupRow to="/admin/posts" icon={Shield} label="后台管理" /> : null}
          </GroupCard>
        </nav>
        {contactSupportError ? (
          <p role="alert" className="mb-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {contactSupportError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
