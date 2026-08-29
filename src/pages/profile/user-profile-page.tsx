import { ArrowLeft, Flag, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PostList } from "../../features/posts/post-list";
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

// 悬浮在头图上的圆形图标按钮——半透明黑底、白色图标，跟 22 号卡任务卡
// 要求的"跟 23 号卡详情页的关闭按钮同一个视觉语言"对齐。写这段代码时
// 23 号卡（帖子详情页头图操作按钮）那个 worktree 还没有任何提交（只是
// 刚从 main 分出来的空分支），没有现成组件可以直接 import 复用，这里先
// 按任务卡描述的样式独立实现；如果 23 号卡落地后两边写法不一致，再考虑
// 抽成共享组件。
const FLOATING_ICON_BUTTON_CLASS_NAME =
  "fixed top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white";

interface FloatingMoreMenuProps {
  userId: string;
}

/**
 * 头图右上角悬浮的"更多操作"圆形图标按钮，点开一个只有"举报用户"一项的
 * 下拉菜单——交互（点击外部/Esc 关闭、点菜单项自动收起）照抄 top-bar.tsx
 * 里 detail 变体用的 MoreMenuButton，那个组件没有导出、样式也是
 * bg-card 图标按钮（不是这次要的半透明黑底悬浮圆形），这里在本文件内
 * 单独实现一份，不跨文件复用，见函数级注释第 5 点。
 */
function FloatingMoreMenu({ userId }: FloatingMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="fixed right-4 top-4 z-10">
      <button
        type="button"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 top-11 min-w-[132px] overflow-hidden rounded-xl bg-card py-1 shadow-lg"
        >
          <Link
            to={`/users/${userId}/report`}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-text hover:bg-bg hover:text-danger"
          >
            <Flag size={16} aria-hidden="true" />
            举报用户
          </Link>
        </div>
      ) : null}
    </div>
  );
}

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
 * 22 号卡（用户主页改版——参考 Meet5 大图头像风格）：这次改版之前先读了一遍
 * 现有代码，发现任务卡描述的起点（顶部地区pill+搜索栏、"关注"按钮、
 * "发布/搭子/收藏"三个切换标签）其实都不存在——这个页面顶部早就只是一个
 * 纯返回箭头（04 号卡换成 TopBar detail 变体之后就是这样），"关注"功能
 * 从来没有建过（没有数据库表、没有路由、没有 UI，不是被隐藏），"发布/
 * 搭子/收藏"三个标签也从没出现过。所以这次实际改动是：
 *   1. 不再用 TopBar——换成悬浮在头图上的圆形返回按钮（半透明黑底），
 *      点击行为不变，还是 navigate(-1)。
 *   2. 头像从 ProfileSummary 的 96px 圆形，换成通栏大方块（aspect-square
 *      + w-full）——用的还是同一个 avatarUrl 字段，没有新增"封面图"字段，
 *      跟任务卡要求一致。这个页面因此不再使用 ProfileSummary，它的
 *      default 变体（96px 圆形居中头像那一版）因此没有调用方了——确认过
 *      24 号卡"我的"页 profile-page.tsx 用的是同一个组件的另一种布局
 *      （原来的 size="compact" 横排卡片，不受这次改动影响）之后，把
 *      default 变体连同它专属的 size 判别式、locationName prop 一起从
 *      profile-summary.tsx 删掉了，不留死代码——"我的"页现在直接不传
 *      size（组件只剩一种布局），行为完全不变。
 *   3. 昵称+简介左对齐；不再展示 locationName 那一行——任务卡给的顺序原话
 *      是"头像下面是昵称 + 个人简介"，没有提城市，这次按字面顺序去掉了
 *      城市这一行（数据本身没删，PublicProfile.locationName 这个字段和
 *      查询都没动，只是页面不渲染；用户确认过按这版就好，不用加回来）。
 *   4. 操作区只留"发消息"+"屏蔽此人"两个按钮并排——任务卡原话"只保留
 *      发消息一个按钮"，但"屏蔽此人"是任务卡完全没提到的真实存在功能
 *      （UGC 安全合规用），这点已经跟用户确认过，明确保留，不属于"关注"
 *      那种"暂时不放入口"的按钮。
 *   5. "举报用户"维持改版前的形态——头图右上角悬浮一个"更多操作"圆形
 *      图标按钮（半透明黑底，跟左上角返回箭头同一个视觉语言），点开一个
 *      只有"举报用户"一项的下拉菜单，交互（点击外部/Esc 关闭、点菜单项
 *      自动收起）照抄 top-bar.tsx 里 detail 变体的 MoreMenuButton；这次
 *      最初一版曾经改成直接跳转的图标链接，用户反馈要改回下拉菜单形式，
 *      已经改回来了。MoreMenuButton 本身在 top-bar.tsx 里不是导出的组件，
 *      这里没有跨文件复用它，是照同一个交互模式在本文件内单独实现了一份
 *      （悬浮黑底圆形样式跟 TopBar 的 bg-card 图标按钮本来就不一样，直接
 *      导入也没法直接复用样式），如果以后这个模式还有第三处需要，再考虑
 *      抽成共享组件。
 *   6. 新增"发布的作品"标题 + 两列卡片网格，复用首页/分类页共用的
 *      PostList 组件（连同它背后的 usePostsInfiniteQuery/
 *      listApprovedPosts），新增一个可选的 authorId 筛选参数，不建新组件、
 *      不建新查询函数——这三层（PostList → usePostsInfiniteQuery →
 *      listApprovedPosts）原来就已经支持 categoryId/stateCode 这类可选
 *      筛选维度，这次只是照着同一个模式再加一维，见这三个文件里
 *      authorId 相关的改动。这个网格背后是"posts_select_public_or_own_
 *      or_admin"这条 RLS 策略本身已经限定的"approved + public"集合，不是
 *      这次新加的可见性判断。
 *
 * "发消息"按钮结构照抄 contact-seller-button.tsx（同一个"未登录点击跳
 * /login、已登录调用 mutation、成功后跳转到会话详情页"的模式），区别是
 * 这里用 createProfileConversation（不绑定帖子，可以对任意用户发起，
 * 带每日限流）。ACCOUNT_RESTRICTED 和 PROFILE_CONVERSATION_DAILY_LIMIT_REACHED
 * 都是明确、可操作的失败原因（对应的 AppError.message 已经是能直接展示
 * 给用户的中文），直接展示；其它未知失败原因才回退到通用文案——跟
 * conversation-page.tsx 处理 ACCOUNT_RESTRICTED 的方式是同一个原则。
 *
 * userId 是当前登录用户自己时不显示"发消息"/"屏蔽此人"按钮（不能给自己
 * 发消息/屏蔽自己，对应数据库 create_profile_conversation 里"cannot start
 * a direct conversation with yourself"这条防御检查）——在 UI 层提前隐藏，
 * 不让用户点了之后才从后端报错，跟 contact-seller-button.tsx 对帖子作者
 * 本人隐藏按钮是同一个原则。未登录访客不算"自己"，仍然会看到按钮，点击后
 * 跳转登录页，不在这里就隐藏掉。
 *
 * UGC 安全功能补齐任务卡 1（屏蔽用户）：屏蔽状态查询（useIsBlockingQuery）
 * 判断当前用户有没有屏蔽这个人，决定按钮文案；点击调用
 * useBlockUserMutation/useUnblockUserMutation，成功后 invalidate 状态
 * 查询，按钮文案自动切换，不需要本地维护一份"是否已屏蔽"的 state。
 * 屏蔽之后这个页面本身不做任何额外处理（比如不隐藏"发消息"按钮）——屏蔽
 * 生效在数据库层（create_profile_conversation 会拒绝创建新会话），点击
 * "发消息"仍然会真的发起请求、拿到一条明确的失败提示。
 *
 * UGC 安全功能补齐任务卡 2（举报用户）：跳转到独立路由
 * /users/:userId/report（见 report-user-page.tsx）。只有 !isOwnProfile
 * 且 data 已经加载出来时才渲染这个入口，跟"发消息"/"屏蔽此人"两个按钮
 * 同一个"自己主页不显示、加载完成前不展示"的判断——不能举报自己，也不能
 * 在还不确定 isOwnProfile 之前先闪一下这个入口，见 report-user-page.tsx
 * 顶部注释里更完整的说明。
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
  const avatarInitial = data?.displayName?.trim().charAt(0).toUpperCase() || "?";

  return (
    <main data-testid="user-profile-page">
      {/* 悬浮返回箭头：不放进下面按数据加载状态才渲染的分支里——不管加载
          中/加载失败/用户不存在，都应该能点这个箭头离开这个页面，跟改版
          前 TopBar 一直渲染返回按钮是同一个行为，只是这次视觉上是悬浮在
          内容上方的半透明圆形，不是一整条顶部栏。 */}
      <button
        type="button"
        aria-label="返回"
        onClick={() => navigate(-1)}
        className={`${FLOATING_ICON_BUTTON_CLASS_NAME} left-4`}
      >
        <ArrowLeft size={18} aria-hidden="true" />
      </button>

      {/* "更多操作"（举报用户）：跟"发消息"/"屏蔽此人"同一个"自己主页不
          显示、数据没加载完不展示"的判断，见上面函数级注释第 5 点。 */}
      {data && !isOwnProfile && userId ? <FloatingMoreMenu userId={userId} /> : null}

      {isPending ? (
        <p role="status" className="p-4 text-sm text-text-muted">
          加载中…
        </p>
      ) : null}

      {isError ? (
        <p
          role="alert"
          className="m-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {LOAD_ERROR_MESSAGE}
        </p>
      ) : null}

      {!isPending && !isError && data === null ? (
        <div className="p-4">
          <h1>用户未找到</h1>
          <p role="alert">用户不存在。</p>
        </div>
      ) : null}

      {!isPending && !isError && data ? (
        <>
          {/* 大方块头图——占屏幕宽度、接近 1:1 比例，用现有头像图裁剪展示，
              没有为此新增"封面图"字段。这里故意放在下面 max-w-md 容器
              外面，才能真的贴到页面左右边缘，不被那个容器的居中宽度限制
              住，跟 17 号卡活动卡片方块头像"铺满整宽"是同一个道理。 */}
          {data.avatarUrl ? (
            <img src={data.avatarUrl} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div
              aria-hidden="true"
              className="flex aspect-square w-full items-center justify-center bg-bg text-6xl font-semibold text-text-muted"
            >
              {avatarInitial}
            </div>
          )}

          <div className="mx-auto max-w-md px-4 pb-20 pt-4 text-left md:pb-6">
            <h1 className="text-xl font-bold text-text">{data.displayName}</h1>

            {data.bio ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text">{data.bio}</p>
            ) : null}

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
              <div className="mt-4 flex items-center gap-3">
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

            {/* 发布的作品：去掉了"发布/搭子/收藏"三个切换标签（这个仓库里
                本来就没建过），直接展示"发布"这一类——复用 PostList 组件
                背后的数据请求和卡片组件，只是多传一个 authorId，不是重新
                做一套。不管是不是自己的主页都展示这个区块，纯展示内容，
                不是一个需要区分身份的操作入口。 */}
            <h2 className="mt-6 text-base font-semibold text-text">发布的作品</h2>
            <div className="mt-3">
              <PostList authorId={userId} />
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
