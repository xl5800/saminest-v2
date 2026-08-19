import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ActivityCard } from "../../components/activity-card";
import { ProfileSummary } from "../../components/profile-summary";
import { TopBar } from "../../components/top-bar";
import { useActivityParticipantPreviewsQuery } from "../../features/activities/use-activity-participant-previews-query";
import { useOrganizerActivitiesQuery } from "../../features/activities/use-organizer-activities-query";
import { useCreateProfileConversationMutation } from "../../features/conversations/use-create-profile-conversation-mutation";
import { usePublicProfileQuery } from "../../features/profile/use-public-profile-query";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";

const DEFAULT_ERROR_MESSAGE = "会话创建失败，请稍后重试。";
const LOAD_ERROR_MESSAGE = "用户信息加载失败，请稍后重试。";

/**
 * 公开个人主页 / 04 号卡里的"发起者主页"（/users/:userId，路由没有用
 * RequireAuth 包裹，游客也能看——跟 post-detail-page.tsx/
 * activity-detail-page.tsx 是同一个可见性模式，只是页面内部"发消息"按钮
 * 未登录时点击会跳去 /login，不是整个页面需要登录）。
 *
 * 头像/昵称/城市/简介 + 发消息，不做"编辑资料"（那是"我的"页
 * profile-page.tsx 的事）。简介为空时整个简介区块不渲染，不显示"暂无简介"
 * 这种占位文案。
 *
 * "发消息"按钮结构照抄 contact-seller-button.tsx（同一个"未登录点击跳
 * /login、已登录调用 mutation、成功后跳转到会话详情页"的模式），区别是
 * 这里用 createProfileConversation（不绑定帖子，可以对任意用户发起，
 * 带每日限流）。ACCOUNT_RESTRICTED 和 PROFILE_CONVERSATION_DAILY_LIMIT_REACHED
 * 都是明确、可操作的失败原因（对应的 AppError.message 已经是能直接展示
 * 给用户的中文），直接展示；其它未知失败原因才回退到通用文案——跟
 * conversation-page.tsx 处理 ACCOUNT_RESTRICTED 的方式是同一个原则。
 *
 * userId 是当前登录用户自己时不显示"发消息"按钮（不能给自己发消息，
 * 对应数据库 create_profile_conversation 里"cannot start a direct
 * conversation with yourself"这条防御检查）——在 UI 层提前隐藏，不让
 * 用户点了之后才从后端报错，跟 contact-seller-button.tsx 对帖子作者本人
 * 隐藏按钮是同一个原则。未登录访客不算"自己"，仍然会看到按钮，点击后
 * 跳转登录页，不在这里就隐藏掉。
 *
 * 头像/姓名/城市/简介这一段展示逻辑抽成了共享组件 ProfileSummary（"我的"
 * 页 profile-page.tsx 也在用，两个页面头部视觉这次统一），这里只把"发
 * 消息"按钮（连同它自己的错误提示）作为 children 传进去——ProfileSummary
 * 只负责摆放，不关心 children 具体是发消息按钮还是别的东西。ProfileSummary
 * 本身用 flex-col items-center，"发消息"按钮自然水平居中，04 号卡要求的
 * "只保留一个发消息按钮、居中显示、不跟收藏/关注等按钮并排"不需要额外
 * 布局改动就已经成立。
 *
 * 04 号卡（find-buddy-flow）改版：
 * - 顶部换成 TopBar 的 detail 变体（返回箭头），不再是页面自己手写的
 *   "←"按钮——不传 moreMenu：这个仓库目前没有"举报用户"这个功能（只有
 *   举报活动/举报帖子），先不在菜单里放一个点了会 404 的空壳入口，等
 *   举报用户功能真的做出来再补，TopBar 的 moreMenu 本来就是可选的，不传
 *   就完全不渲染"…"按钮，见 top-bar.tsx 顶部注释。
 * - 新增"TA 发起的搭子"区块：查 useOrganizerActivitiesQuery(userId)（只
 *   返回这个用户公开可见、招募中的活动，不是"我的活动"页那个只能查自己的
 *   listMyOrganizedActivities，见该 repository 函数顶部注释），卡片复用
 *   ActivityCard（跟活动列表页同一个组件），保证头像堆叠是同一套放大后的
 *   48px 样式，不是这个页面自己另起一份。没有活动时不渲染这个区块的空态
 *   文案之外的任何东西——查询结果是空数组就直接不显示整个区块标题，不用
 *   "TA 还没有发起过搭子"这类占位文案硬撑一个空区块。
 */
export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.user.id;

  const { data, isPending, isError } = usePublicProfileQuery(userId ?? "");
  const createConversation = useCreateProfileConversationMutation();
  const [error, setError] = useState<string | null>(null);

  const { data: organizedActivities } = useOrganizerActivitiesQuery(userId ?? "");
  const { data: participantPreviews } = useActivityParticipantPreviewsQuery(
    (organizedActivities ?? []).map((activity) => activity.id)
  );

  function handleMessage(): void {
    if (!userId) return;

    if (!currentUserId) {
      navigate("/login");
      return;
    }
    if (createConversation.isPending) return;

    setError(null);
    createConversation.mutate(userId, {
      onSuccess: ({ conversationId }) => {
        navigate(`/messages/${conversationId}`);
      },
      onError: (mutationError) => {
        if (
          mutationError instanceof AppError &&
          (mutationError.code === "ACCOUNT_RESTRICTED" ||
            mutationError.code === "PROFILE_CONVERSATION_DAILY_LIMIT_REACHED")
        ) {
          setError(mutationError.message);
        } else {
          setError(DEFAULT_ERROR_MESSAGE);
        }
      }
    });
  }

  const isOwnProfile = !!currentUserId && currentUserId === userId;

  return (
    <main data-testid="user-profile-page">
      <TopBar variant="detail" />

      <div className="mx-auto max-w-md px-4 pb-20 md:pb-6">
        {isPending ? <p role="status" className="text-sm text-text-muted">加载中…</p> : null}

        {isError ? (
          <p role="alert" className="rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
            {LOAD_ERROR_MESSAGE}
          </p>
        ) : null}

        {!isPending && !isError && data === null ? (
          <>
            <h1>用户未找到</h1>
            <p role="alert">用户不存在。</p>
          </>
        ) : null}

        {!isPending && !isError && data ? (
          <>
            <ProfileSummary
              displayName={data.displayName}
              avatarUrl={data.avatarUrl}
              locationName={data.locationName}
              bio={data.bio}
            >
              {error ? (
                <p role="alert" className="mt-3 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              {!isOwnProfile ? (
                <button
                  type="button"
                  onClick={handleMessage}
                  disabled={createConversation.isPending}
                  className="mt-4 rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createConversation.isPending ? "创建会话中…" : "发消息"}
                </button>
              ) : null}
            </ProfileSummary>

            {organizedActivities && organizedActivities.length > 0 ? (
              <section className="mt-8">
                <h2 className="mb-3 text-base font-bold text-text">TA 发起的搭子</h2>
                <div className="flex flex-col gap-3">
                  {organizedActivities.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      participants={participantPreviews?.get(activity.id) ?? []}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
