import { Flag } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ProfileSummary } from "../../components/profile-summary";
import { TopBar } from "../../components/top-bar";
import { useCreateProfileConversationMutation } from "../../features/conversations/use-create-profile-conversation-mutation";
import { useBlockUserMutation } from "../../features/blocks/use-block-user-mutation";
import { useIsBlockingQuery } from "../../features/blocks/use-is-blocking-query";
import { useUnblockUserMutation } from "../../features/blocks/use-unblock-user-mutation";
import { usePublicProfileQuery } from "../../features/profile/use-public-profile-query";
import { useAuthStore } from "../../store/auth-store";
import { AppError } from "../../utils/app-error";

const DEFAULT_ERROR_MESSAGE = "会话创建失败，请稍后重试。";
const LOAD_ERROR_MESSAGE = "用户信息加载失败，请稍后重试。";
const BLOCK_ERROR_MESSAGE = "操作失败，请稍后重试。";

/**
 * 公开个人主页 / 04 号卡里的"发起者主页"（/users/:userId，路由没有用
 * RequireAuth 包裹，游客也能看——跟 post-detail-page.tsx/
 * activity-detail-page.tsx 是同一个可见性模式，只是页面内部"发消息"按钮
 * 未登录时点击会跳去 /login，不是整个页面需要登录）。这个页面结构对任何
 * 用户都一样，不区分"是不是某个活动的发起人"——发起人跟普通用户看到的是
 * 同一个组件、同一套结构，07 号卡（活动卡片头像区放大 + 发起者联系参与者）
 * 正是靠这一点，把"发起者点参与者头像"和"参与者点发起人整行"两个方向的
 * 联系需求，统一收进"点头像/整行 → 进这个页面 → 点发消息"这一套机制，不用
 * 分别建两套 UI。
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
 * 消息"+"屏蔽此人"这两个按钮（连同它们各自的错误提示）作为 children 传
 * 进去——ProfileSummary 只负责摆放，不关心 children 具体是什么。
 * ProfileSummary 本身用 flex-col items-center，两个按钮包在同一个
 * flex 行容器里水平并排、整体居中，04 号卡要求的"发消息按钮居中"不受
 * 影响（04 号卡"不跟收藏/关注等按钮并排"这条针对的是"额外的收藏/关注
 * 功能"，屏蔽是这次任务卡明确要求跟发消息放在一起的入口，不在那条限制
 * 范围内）。
 *
 * 04 号卡（find-buddy-flow）改版：顶部换成 TopBar 的 detail 变体（返回
 * 箭头），不再是页面自己手写的"←"按钮。当初这里特意不传 moreMenu——那时
 * 这个仓库还没有"举报用户"功能（只有举报活动/举报帖子），不想在菜单里
 * 放一个点了会 404 的空壳入口。UGC 安全功能补齐任务卡 2（举报用户）
 * 补上之后，现在恢复传 moreMenu，见下面新增的说明段落。
 *
 * 07 号卡（活动卡片头像区放大 + 发起者联系参与者）：删掉了 04 号卡最初
 * 引入的"TA 发起的搭子"活动列表区块（连同它用到的
 * useOrganizerActivitiesQuery/useActivityParticipantPreviewsQuery/
 * ActivityCard——这几个 import 因此也一并去掉了）。产品决定不需要在发起
 * 者主页单独展示一份"TA 发起的活动"列表，联系发起人/参与者已经有更直接
 * 的入口（活动详情页的发起人整行 + 参与者头像，见
 * activity-participant-avatars.tsx），这个页面重新变回"只有资料 + 发消息"
 * 的最简单形态，没有必要为了一个没有额外产品价值的列表继续维护
 * listOrganizerActivities 这条专门为了避开 RLS 假阴性而写的查询（已经在
 * activities-repository.ts 里一并删掉，见该文件对应位置的说明）。
 *
 * UGC 安全功能补齐任务卡 1（屏蔽用户）：加"屏蔽此人/取消屏蔽"按钮，跟
 * "发消息"并排。屏蔽状态查询（useIsBlockingQuery）判断当前用户有没有
 * 屏蔽这个人，决定按钮文案；点击调用 useBlockUserMutation/
 * useUnblockUserMutation，成功后 invalidate 状态查询，按钮文案自动切换，
 * 不需要本地维护一份"是否已屏蔽"的 state。屏蔽/取消屏蔽都要求登录——跟
 * "发消息"按钮同一个判断（未登录点击跳 /login），isOwnProfile 时不显示
 * （不能屏蔽自己）。
 *
 * 屏蔽之后这个页面本身不做任何额外处理（比如不隐藏"发消息"按钮）——
 * 屏蔽生效在数据库层（create_profile_conversation 会拒绝创建新会话），
 * 点击"发消息"仍然会真的发起请求、拿到一条明确的失败提示，这跟
 * conversation-page.tsx 用 useIsBlockedPairQuery 提前隐藏输入框、给出
 * 更友好体验的做法不同——这个页面的"发消息"按钮本来就已经有一套完整的
 * 错误展示机制（AppError.message 直接展示），额外加一次"屏蔽预检"查询
 * 只是为了把同一个错误提前一步展示，收益有限，不是这次任务要求的范围，
 * 没有跟着做。
 *
 * UGC 安全功能补齐任务卡 2（举报用户）：TopBar 的"…"更多菜单里加一个
 * "举报用户"入口（Flag 图标 + 文案，样式照抄 activity-detail-page.tsx
 * 举报活动那一项），跳转到独立路由 /users/:userId/report（见
 * report-user-page.tsx）。只有 !isOwnProfile 且 data 已经加载出来时才传
 * moreMenu，跟"发消息"/"屏蔽此人"两个按钮同一个"自己主页不显示"的判断——
 * 不能举报自己，见 report-user-page.tsx 顶部注释里更完整的说明（那边除了
 * 入口隐藏之外，还在页面自己内部加了一道防御性判断，应对用户手动拼 URL
 * 直接访问这个路由的情况）。data 未加载完成时不渲染 moreMenu（保持
 * undefined，TopBar 就完全不显示"…"按钮），等 isOwnProfile 能被正确判断
 * 之后再决定要不要显示，避免在加载过程中先闪一下"举报用户"入口——跟
 * activity-detail-page.tsx `moreMenu={data ? {...} : undefined}` 是同一个
 * 处理方式。
 */
export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const currentUserId = session?.user.id;

  const { data, isPending, isError } = usePublicProfileQuery(userId ?? "");
  const createConversation = useCreateProfileConversationMutation();
  const [error, setError] = useState<string | null>(null);

  const { data: isBlocking } = useIsBlockingQuery(currentUserId, userId);
  const blockMutation = useBlockUserMutation();
  const unblockMutation = useUnblockUserMutation();
  const [blockError, setBlockError] = useState<string | null>(null);

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

  async function handleToggleBlock(): Promise<void> {
    if (!userId) return;

    if (!currentUserId) {
      navigate("/login");
      return;
    }
    if (blockMutation.isPending || unblockMutation.isPending) return;

    setBlockError(null);
    try {
      if (isBlocking) {
        await unblockMutation.mutateAsync({ blockerId: currentUserId, blockedId: userId });
      } else {
        await blockMutation.mutateAsync({ blockerId: currentUserId, blockedId: userId });
      }
    } catch {
      setBlockError(BLOCK_ERROR_MESSAGE);
    }
  }

  const isOwnProfile = !!currentUserId && currentUserId === userId;
  const isBlockActionPending = blockMutation.isPending || unblockMutation.isPending;

  return (
    <main data-testid="user-profile-page">
      <TopBar
        variant="detail"
        moreMenu={
          data && !isOwnProfile
            ? {
                label: "更多操作",
                content: (
                  <Link
                    to={`/users/${userId}/report`}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-bg hover:text-danger"
                  >
                    <Flag size={16} aria-hidden="true" />
                    举报用户
                  </Link>
                )
              }
            : undefined
        }
      />

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
            {blockError ? (
              <p role="alert" className="mt-3 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
                {blockError}
              </p>
            ) : null}

            {!isOwnProfile ? (
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleMessage}
                  disabled={createConversation.isPending}
                  className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createConversation.isPending ? "创建会话中…" : "发消息"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleBlock()}
                  disabled={isBlockActionPending}
                  className="rounded-full border border-border px-6 py-2 text-sm font-semibold text-text hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isBlockActionPending ? "处理中…" : isBlocking ? "取消屏蔽" : "屏蔽此人"}
                </button>
              </div>
            ) : null}
          </ProfileSummary>
        ) : null}
      </div>
    </main>
  );
}
