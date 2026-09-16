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

// 悬浮圆形图标按钮。原来是半透明黑底+白色图标（跟 22 号卡任务卡要求的
// "跟 23 号卡详情页的关闭按钮同一个视觉语言"对齐），那套配色是专门给
// 深色渐变头图设计的——去 Banner 改版把头图删掉之后，这两个按钮会浮在
// 页面画布的浅灰背景上，半透明黑底+白图标在浅色背景上看起来像两个灰扑扑
// 的色块、对比度也变得奇怪，这次改成浅色版本：bg-card 白底 + text-text
// 深色图标 + border border-border 细边框（参照本文件"屏蔽此人"按钮已经
// 在用的写法）+ shadow-settings-item 投影（项目里已有这个 token，
// profile-page.tsx 退出登录卡片在用），撑出悬浮在内容上方的层次感，不是
// 新引入一套配色语言。
const FLOATING_ICON_BUTTON_CLASS_NAME =
  "fixed top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text shadow-settings-item";

interface FloatingMoreMenuProps {
  userId: string;
}

/**
 * 悬浮的"更多操作"圆形图标按钮，点开一个只有"举报用户"一项的下拉菜单——
 * 交互（点击外部/Esc 关闭、点菜单项自动收起）照抄 top-bar.tsx 里 detail
 * 变体用的 MoreMenuButton，那个组件没有导出，这里在本文件内单独实现
 * 一份，不跨文件复用，见函数级注释第 5 点。
 *
 * 去 Banner 改版：按钮配色从半透明黑底+白图标换成浅色版本，理由跟左上角
 * 返回按钮（FLOATING_ICON_BUTTON_CLASS_NAME）完全一样，见那个常量上面的
 * 注释，这里不重复贴一遍。
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
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-text shadow-settings-item"
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
 *      size（组件只剩一种布局），行为完全不变。（下面 Facebook 风格头图
 *      改版把这一版通栏大方块头像整个替换掉了，见下方说明。）
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
 *      抽成共享组件。这次头图改版没有动这两个悬浮按钮——它们是 fixed
 *      定位，不依赖下面内容区域的高度，白色图标+半透明黑底在新的蓝色
 *      渐变背景上对比度依然够。
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
 * 公开个人主页去 Banner 改版：BARRY 用 Claude Design 画了一版新 mockup
 * 跟真实截图反复对比后确认，22 号卡加的 Facebook 风格深色渐变头图
 * （h-28 bg-gradient-to-b from-primary to-primary-dark 那块纯装饰性色块，
 * 背后没有任何 <img>、不是"封面图"）整个去掉——头像/昵称/年龄放回同一行
 * （头像左，昵称+年龄纵向排列在右），年龄从"简介下面单独一行"挪进昵称
 * 这个文字块里，跟改版前的相对顺序（简介在昵称下面、年龄在简介下面）不再
 * 一样。头像不再需要 -mt-12（压在深色/浅色交界线上的悬浮效果）和
 * ring-4 ring-card（白色描边，同样是给交界线上的头像用的），因为没有
 * 交界线可"压"了，尺寸维持 h-24 w-24 不变。紧跟在头像/昵称行下面的
 * 内容区不再需要那层专门跟渐变色块衔接的"整块白卡片"包装（bg-card），
 * 直接用页面画布默认背景（不显式设置 class，继承 body 的 bg-bg），跟
 * 站内其它页面一致；改成显式加一个 pt-6，补上原来靠渐变色块高度撑出来
 * 的、不被悬浮返回/更多操作按钮遮住内容的顶部空间。
 *
 * 头像/昵称/年龄这一行下面依次：个人简介（data.bio，为空整段不渲染，
 * 逻辑不变）→ 发消息/屏蔽按钮（位置和逻辑不变）→"作品"标题（改版前是
 * "发布的作品"，这次精简成两个字）+ 网格（不变）。data.age（
 * PublicProfile 类型和 getPublicProfile() 早就在查这一列了，见
 * profiles-repository.ts，这次没有改仓库层）为 null 时那一行不渲染，
 * 不做年龄段/星座这类推断，这条判断逻辑本身没有变，只是渲染位置变了。
 *
 * 没有头像时的首字母占位兜底样式沿用改版前已有的判断逻辑（data.avatarUrl
 * 是否存在），只是去掉了 -mt-12/ring-4 ring-card 这两条"悬浮在交界线上"
 * 专用的样式，不是重新设计一套判断分支。
 *
 * 悬浮返回/更多操作按钮的配色（FLOATING_ICON_BUTTON_CLASS_NAME、
 * FloatingMoreMenu 内部按钮）也跟着从半透明黑底+白图标换成浅色版本——
 * 那套配色是专门给深色渐变头图设计的，banner 去掉之后浮在浅色背景上会
 * 看起来像两个灰扑扑的色块，见这两处各自的注释。
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
          <h1 className="text-lg font-semibold text-text">用户未找到</h1>
          {/* 全 App 视觉 Token 体系（第二批）：这条 role="alert" 之前完全
              没有颜色 class（直接继承默认黑字），补上 text-danger，跟这个
              页面上面 isError 分支的 alert 文字同一个颜色语义。 */}
          <p role="alert" className="mt-1 text-sm text-danger">
            用户不存在。
          </p>
        </div>
      ) : null}

      {!isPending && !isError && data ? (
        // 去 Banner 改版：Facebook 风格深色渐变头图（h-28
        // bg-gradient-to-b from-primary to-primary-dark）整块删掉，跟着
        // 一起去掉的还有紧跟在它下面那层专门跟它衔接的"整块白卡片"包装
        // （bg-card，之前是因为要跟渐变色块的深浅交界线对齐才单独给的
        // 背景，不是常规单张卡片样式）——现在直接用页面画布默认背景
        // （不显式设置 class，继承 body 的 bg-bg），跟站内其它页面一致，
        // 不再是这个页面特有的处理。顶部补一个 pt-6，给内容留出不被悬浮
        // 返回/更多操作按钮遮住的空间（改版前这块空间是渐变色块撑出来
        // 的，现在需要显式加）。原来这里是一个 Fragment 包着渐变色块 +
        // 内容区两个 sibling，banner 删掉之后只剩这一个 div，不再需要
        // Fragment 包裹。
        <div className="mx-auto max-w-md px-4 pb-20 pt-6 text-left md:pb-6">
          {/* 头像/昵称/年龄同一行：去掉了 -mt-12（压在深色/浅色交界线上的
              悬浮效果，banner 没了这条就没有意义）和 ring-4 ring-card
              （白色描边同理是给交界线上的头像用的），尺寸维持 h-24 w-24
              不变。items-end 改成 items-center——原来靠"文字基线对齐头像
              底部"制造头像和昵称并排的视觉效果，现在两者不再有 deliberate
              的高度差，居中对齐更自然。年龄从原来紧跟在简介下面单独一行，
              挪进昵称这个文字块里（昵称在上、年龄在下），简介保持在头像/
              昵称/年龄这一整行下面、独立成一行，位置跟改版前相对关系
              不变。 */}
          <div className="flex items-center gap-4">
            {data.avatarUrl ? (
              <img
                src={data.avatarUrl}
                alt=""
                className="h-24 w-24 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-bg text-3xl font-semibold text-text-muted"
              >
                {avatarInitial}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-text">{data.displayName}</h1>
              {data.age !== null ? (
                <p className="mt-0.5 text-sm text-text-muted">{data.age} 岁</p>
              ) : null}
            </div>
          </div>

          {data.bio ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-text">
              {data.bio}
            </p>
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

          {/* "作品"（改版前是"发布的作品"，这次按任务卡要求精简成两个
              字）：去掉了"发布/搭子/收藏"三个切换标签（这个仓库里本来就
              没建过），直接展示"发布"这一类——复用 PostList 组件背后的
              数据请求和卡片组件，只是多传一个 authorId，不是重新做一套。
              不管是不是自己的主页都展示这个区块，纯展示内容，不是一个
              需要区分身份的操作入口。 */}
          <h2 className="mt-6 text-base font-semibold text-text">作品</h2>
          <div className="mt-3">
            <PostList authorId={userId} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
