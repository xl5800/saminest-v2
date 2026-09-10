import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Share2, X } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { CommentSection } from "../../components/comment-section";
import { ContactSellerButton } from "../../components/contact-seller-button";
import { FavoriteButton } from "../../components/favorite-button";
import { ImageLightbox } from "../../components/image-lightbox";
import { PersonCard } from "../../components/person-card";
import { PostShareActionSheet } from "../../components/post-share-action-sheet";
import { WechatBrowserBanner } from "../../components/wechat-browser-banner";
import { formatLocationDisplayName } from "../../data/us-states";
import { usePostDetailQuery } from "../../features/posts/use-post-detail-query";
import type { PostDetail } from "../../repositories/posts-repository";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import { formatPrice, formatRelativeTimeAgo, isPriceUnset } from "../../utils/format";

interface PostDetailLocationState {
  publishSuccessMessage?: string;
}

/**
 * 发布表单提交成功后会带着 location.state.publishSuccessMessage 跳转到
 * 这里，用来展示"发布成功，等待审核"提示。这条提示现在展示在真实帖子内容
 * 上方——发帖人自己立刻就能看到刚发布的这条帖子的真实内容（RLS 允许作者
 * 本人查看自己任何状态的帖子，见 posts-repository.ts 的 getPostDetail），
 * 不再是之前占位页那种"看不到内容、只看到一句提示"的状态。
 *
 * 帖子不存在 / 当前登录身份看不到（未通过审核且不是作者本人也不是管理员）
 * 这两种情况统一渲染同一条"帖子未找到"文案，不做任何区分——这是故意的：
 * 区分开来会向未授权的访问者泄露"这个 ID 存在，只是还没通过审核"这种
 * 信息，getPostDetail 在 repository 层已经把这两种情况都收敛成同一个
 * null 返回值，页面这一层不应该、也没有能力再把它们分开。
 *
 * 图片区是横向大图轮播：用原生 CSS scroll-snap（横向 overflow-x-auto
 * 容器 + snap-x snap-mandatory、每张图 snap-center + flex-none w-full）
 * 实现，不引入额外的手势/轮播库。当前滑到第几张靠 onScroll 读容器的
 * scrollLeft / 容器宽度换算，驱动底部"1 / N"计数指示器（只有 1 张图时
 * 不显示，跟 ImageLightbox 自己"只有一张图不显示计数/切换按钮"的判断是
 * 同一个逻辑）。点击当前这张大图打开的还是 ImageLightbox 全屏查看器，
 * ImageLightbox 组件本身没有改动。
 *
 * "分享"按钮用官方 @capacitor/share 插件调系统原生分享面板，不接入微信
 * SDK；这个插件在纯浏览器环境下会自动降级用标准 Web Share API
 * （navigator.share()），网页版访问详情页也能用同一个按钮，不用写
 * App/网页两套逻辑。分享链接见上面 PRODUCTION_ORIGIN 的注释——不能用
 * window.location.origin 拼。
 *
 * 23 号卡（帖子详情页顶部+分享/收藏/举报操作区改版），先读代码的结论（写
 * 在这里，完工报告里也有一份）：
 *
 * 1. 顶部栏：21 号卡当初给这个页面加的是 TopBar 的 nav-only 变体（一条
 *    常规返回箭头顶栏）。这次要求"悬浮在图片上的关闭(X)按钮"是完全不同
 *    的视觉形态——nav-only 渲染的是一条正常文档流里的、有自己背景色的
 *    横条，不是叠在图片上方的半透明浮层，套不上去。这里改成页面自己渲染
 *    一个 `fixed` 定位的圆形按钮，不再用 TopBar 组件，也把这个路由从
 *    app-shell.tsx 的 TOPBAR_MIGRATED_PATTERNS 挪进了 NO_CHROME_PATTERNS
 *    （AppHeader/BottomNav 都不需要了，见该文件里 23 号卡的注释）。
 * 2. "收藏"（FavoriteButton）"分享"（下面 handleShare，调用同一个
 *    @capacitor/share）背后的逻辑完全没动，这次只是新增了一个 icon 展示
 *    变体（FavoriteButton 新增 variant="icon" prop）+ 换了位置。
 *    ——这一条里"分享/收藏/举报三个图标一行"的具体布局已被下面的任务卡3
 *    取代（三个操作合并进固定底部工具栏），这一条只保留"背后逻辑没动"这个
 *    结论，位置/布局以任务卡3为准。
 * 3. "举报"：这个仓库本来就有帖子举报功能——独立路由 /post/:id/report
 *    （report-post-page.tsx），改版前就以文字链接的形式挂在这个页面上,
 *    这次复用同一个路由，只是把文字链接换成图标样式、挪到新的位置，
 *    没有新增任何数据库表/迁移。——入口位置同样已被任务卡3取代（举报现在
 *    是"分享"弹层里的一个选项，不再是内容区里的独立图标/链接），路由和
 *    repository 逻辑不变。
 * 4. "发帖者导航条（头像+昵称+活跃时间）"：初版发现这个东西不存在（只有
 *    一行纯文字"发布者：{authorDisplayName}"），补完这一版之后已经建成
 *    真正的可点卡片——见下面第 5 点。
 *
 * 补完（复用活动详情页的"发起人卡片"）：
 * 5. 发帖者卡片：`getPostDetail()` 的 select 扩展成跟
 *    activities-repository.ts 的 organizer 查询同一个模式——加一列裸的
 *    `author_id`（不再只查 usePostAuthorQuery 那个单独的轻量查询）+ 把
 *    嵌套的 `author:profiles(display_name)` 加上 `avatar_url`，一次查询
 *    顺带带出来，不新开请求。`PersonCard` 是从
 *    activity-detail-page.tsx 那张"发起人卡片"抽出来的共享组件（原来是
 *    内联 JSX，不是组件，这次先抽取再复用，不是照着视觉效果另外重写一遍
 *    ——见 person-card.tsx），两个页面现在共用同一份实现。
 *
 *    副标题文案本来想做"活跃于 X 前"（最后活跃时间），调查后发现
 *    `profiles.last_active_at` 这一列虽然在表定义里，但全仓库没有任何
 *    触发器/RPC/前端代码会写入它——不是"数据还没采集"，是"这一列的值对
 *    所有用户永远是 null，因为压根没有代码路径更新它"，等同于没有这个
 *    数据。按指示没有为了这一个字段新增触发器/迁移去维护它，退回展示帖子
 *    自己的发布时间："发布于 {formatRelativeTimeAgo(data.createdAt)}"
 *    （新增的相对时间格式化函数，见 utils/format.ts 顶部对这个决定的
 *    完整说明）。
 *
 * 布局改动本身：
 * - 价格改成 isPriceUnset 命中时整行不渲染（不是显示"价格未填写"），
 *   跟 19 号卡帖子卡片的规则一致；顺序也从"价格在标题上方"改成"标题在
 *   价格上方"。
 * - 原来的"分类标签 + 地区 + 发布时间"这个次要信息区块拆开了：分类标签
 *   和发布时间这次的新顺序里没有位置（跟 19 号卡去掉卡片上的分类标签是
 *   同一个"信息精简"方向，这次连带一起从详情页拿掉了，不是遗漏——如果
 *   还想保留这两项，需要你确认放在哪）；地区单独留了一行，就在价格下面。
 * - "联系方式"（contactMethod/contactValue，卖家自己填的电话/微信号
 *   之类）这个区块，任务卡给的新顺序里没有列出来，但这是卖家主动填写的
 *   可操作信息，直接删掉丢失信息的代价比"分类标签/发布时间"这两项纯
 *   装饰性元数据大得多——这次选择保留，放在分享/收藏/举报那一行下面、
 *   房屋描述上面，不是任务卡列出的顺序原文，是这次改动里唯一一个"没有
 *   被要求但我选择保留"的判断，同样写进了完工报告。
 * - 底部标准 BottomNav 换成常驻的"咨询"大按钮：复用 ContactSellerButton
 *   （新增 label/className prop 支持自定义文案/样式，逻辑一行没动），
 *   自己 fixed 定位在屏幕底部，不需要额外包一层容器——这个按钮在"作者
 *   查看自己发的帖子"时会返回 null（组件原有行为，不能联系自己），这种
 *   情况下屏幕底部就是空的，不会有一条空的边框/背景条悬在那，因为这里
 *   压根没有额外包一层始终渲染的容器。
 * - 留言区：CommentSection 的可见标题从"评论"改成"留言"（连同它的
 *   aria-label），见该组件文件顶部注释；标题以外的文案（输入框
 *   placeholder、按钮文案、空态文案）不在"标题"这个措辞的范围内，没有
 *   动，这也写进了完工报告方便你确认要不要一并改。
 *
 * 任务卡3（帖子详情页操作区改版：固定底部工具栏 + 分享弹层 + 沉浸式头图）：
 *
 * 1. 固定底部工具栏：分享/咨询/收藏合并成同一条 fixed 底部工具栏（顺序
 *    固定），取代了原来"内容区里一行分享/收藏/举报图标"+"单独 fixed 的
 *    咨询按钮"这两块分开的东西——data-testid="post-detail-contact-bar"
 *    这个容器复用了原来那个咨询按钮容器的定位/边框/安全区适配，只是现在
 *    横排三个操作而不是只放一个按钮。原来的 empty:hidden 技巧不再适用
 *    （容器现在总有分享+收藏两个图标子节点，永远不会真的是空的），改成
 *    始终渲染整条工具栏；ContactSellerButton 在作者查看自己帖子时仍然
 *    返回 null（组件内部逻辑没动），这种情况下工具栏里自然只剩两个图标，
 *    不需要额外判断。工具栏跟主内容一起只在 data 加载成功后才渲染（原来
 *    这个容器在 isPending/data===null 时也会渲染，只是 ContactSellerButton
 *    自己内部保持隐藏——这次顺带修正了这一点：分享既然需要 data.title/
 *    价格文案，工具栏整体没有理由在帖子还没加载出来、或者"帖子未找到"页面
 *    上出现）。
 * 2. "咨询按钮有些帖子不显示"排查结论：读了 use-post-author-query.ts /
 *    getPostAuthorId() 背后的 RLS 策略（posts_select_public_or_own_or_admin，
 *    见 supabase/migrations/20260715220300_create_posts_table.sql），它
 *    和 getPostDetail() 主查询命中的是同一张表、同一行、同一套 RLS 分支
 *    （approved+public，或 author_id=自己，或管理员）——对同一个查看者、
 *    同一个帖子，这两个查询的可见性永远一致，没有找到任何"帖子详情能看到
 *    但作者 ID 查不到"的代码路径。结论：这不是 bug，是"作者查看自己发布的
 *    帖子"这种预期行为（ContactSellerButton 组件内部 authorId===userId
 *    时故意返回 null，不能联系自己）——没有为这一条改 use-post-author-
 *    query.ts / posts-repository.ts / contact-seller-button.tsx 任何代码。
 * 3. 分享改成自定义弹层（见 post-share-action-sheet.tsx）：复制链接/分享到
 *    微信/举报三个选项，跟 publish-action-sheet.tsx 同一套弹层模式。
 * 4. 沉浸式头图：图片轮播从 aspect-[4/3] 改成 h-[50dvh]（占满上半屏，跟
 *    conversation-page.tsx 用 dvh 而不是 vh 是同一个理由——避免移动端浏览
 *    器地址栏收起/展开时的视口高度跳动），配合 index.html 新增的
 *    viewport-fit=cover 和下面 useEffect 里对 @capacitor/status-bar 的
 *    per-page 覆盖（overlaysWebView: true 让图片延伸到状态栏底下）。状态栏
 *    图标明暗没有按图片内容动态判断（那需要采样图片像素算亮度，这个仓库
 *    目前的照片来源是用户上传的任意内容，明暗不可预测，做不到稳定可靠）
 *    ——退回任务卡建议的另一条路：图片顶部叠一层黑到透明的渐变遮罩，配合
 *    固定的 Style.Dark（白色图标），保证图标在任何照片上都看得清。离开
 *    这个页面（或者帖子没有图片）时必须把状态栏恢复成 mobile-bootstrap.ts
 *    里设的全局默认（overlaysWebView: false + Style.Light），不能让这个
 *    页面的临时设置泄漏到其它页面；这两个插件调用只在原生壳里有意义，跟
 *    mobile-bootstrap.ts 一样用 Capacitor.isNativePlatform() 判断，网页版
 *    直接跳过。
 * 5. "描述"小节标题：跟活动详情页"活动描述"的 <h2 className="mb-1 text-sm
 *    font-semibold text-text"> 同一个写法，加在 data.description 正文
 *    上方。
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as PostDetailLocationState | null;
  const publishSuccessMessage = state?.publishSuccessMessage;

  const { data, isPending, isError } = usePostDetailQuery(id ?? "");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // 任务卡3：点击底部工具栏"分享"图标弹出的自定义弹层（复制链接/分享到
  // 微信/举报），见 post-share-action-sheet.tsx。
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  // 大图轮播当前滚动到第几张，驱动底部"1 / 5"这种计数指示器。用原生
  // scroll-snap（横向 overflow-x-auto + snap-x snap-mandatory 容器、每张图
  // snap-center）实现滑动，不引入额外的手势/轮播库；这里只是监听容器的
  // onScroll，用 scrollLeft / 容器宽度 换算出当前索引，不需要跟踪拖拽状态。
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // 传给 ImageLightbox 的图片数组要先过滤掉 publicUrl 是 null 的项（类型是
  // string | null），点击某一张大图时传的 initialIndex 必须是"过滤后
  // 数组里的索引"，不能直接用 data.images 里的原始下标——如果中间有图片
  // publicUrl 是 null 被过滤掉了，两个下标会对不上，点第 3 张图会打开
  // 另一张图。这里单次遍历同时算出 lightboxImages（喂给 ImageLightbox 的
  // 纯 URL 数组）和每张图对应的 lightboxIndex（publicUrl 是 null 时为
  // null，图片按钮据此禁用，不触发打开查看器）。
  const lightboxImages: string[] = [];
  const imagesWithLightboxIndex = (data?.images ?? []).map((image) => {
    if (image.publicUrl === null) {
      return { ...image, lightboxIndex: null as number | null };
    }
    const indexInLightbox = lightboxImages.length;
    lightboxImages.push(image.publicUrl);
    return { ...image, lightboxIndex: indexInLightbox };
  });

  function handleCarouselScroll(event: UIEvent<HTMLDivElement>): void {
    const container = event.currentTarget;
    if (container.clientWidth === 0) return;
    const index = Math.round(container.scrollLeft / container.clientWidth);
    setCurrentImageIndex(index);
  }

  // 用户主动关掉系统分享面板（没选任何 App）也会让这个 promise reject，
  // 但 Android/iOS/Web Share API 三端 reject 的时机和错误信息不完全一致，
  // 没法可靠区分"用户取消"和"插件真的调用失败"——按任务卡的指示，宁可把
  // 两种情况都静默吞掉（只 console.error，不弹用户可见的错误提示），也不
  // 要因为一次正常的取消分享给用户看一个莫名其妙的"分享失败"提示。
  async function handleShare(post: PostDetail): Promise<void> {
    if (!id) return;
    try {
      await Share.share({
        title: post.title,
        text: formatPrice(post.priceAmount, post.priceLabel, post.currencyCode),
        url: `${PRODUCTION_ORIGIN}/post/${id}`,
        dialogTitle: "分享"
      });
    } catch (error) {
      console.error("分享失败：", error);
    }
  }

  const priceUnset = data ? isPriceUnset(data.priceAmount, data.priceLabel) : true;
  const hasImmersiveHeader = Boolean(data && data.images.length > 0);

  // 任务卡3：沉浸式头图——只在原生壳（App，不是网页版）+ 帖子确实有图片
  // 时，把状态栏切到 overlay 模式（图片延伸到状态栏底下）+ 白色图标
  // （Style.Dark，配合图片顶部的黑到透明渐变遮罩保证任何照片背景下都看得
  // 清）。依赖 hasImmersiveHeader 这个布尔值而不是 data 本身——data 每次
  // refetch 都是新的对象引用，但"有没有图片"这件事通常不变，用布尔值避免
  // 每次 refetch 都重新调用一次原生插件。离开页面（或者 hasImmersiveHeader
  // 变成 false）时必须还原成 mobile-bootstrap.ts 设的全局默认，不能让这个
  // 页面的临时设置泄漏到其它页面。
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !hasImmersiveHeader) {
      return;
    }
    void StatusBar.setOverlaysWebView({ overlay: true });
    void StatusBar.setStyle({ style: Style.Dark });
    return () => {
      void StatusBar.setOverlaysWebView({ overlay: false });
      void StatusBar.setStyle({ style: Style.Light });
    };
  }, [hasImmersiveHeader]);

  return (
    <main>
      {/* 23 号卡：悬浮在图片上的关闭按钮，取代 21 号卡的 TopBar nav-only
          返回箭头——半透明黑底圆形，固定在视口左上角（不是只叠在图片
          容器内——没有图片的帖子也需要这个按钮，固定在视口上比"挂在图片
          容器里、没图片时无处可挂"更稳妥），点击返回上一页，跟 TopBar
          自己的 BackButton 默认行为（navigate(-1)）一致。 */}
      <button
        type="button"
        aria-label="关闭"
        onClick={() => navigate(-1)}
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        className="fixed left-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
      >
        <X size={20} aria-hidden="true" />
      </button>

      {/* 底部留出空间给下面 fixed 的分享/咨询/收藏工具栏（作者查看自己的
          帖子时 ContactSellerButton 内部返回 null，工具栏只剩分享+收藏
          两个图标，高度基本不变，这里统一留白，不为这一种情况单独算一次
          留白高度）。任务卡2 把按钮从"贴边大色块"改成"容器 pt-3 + 48px
          按钮高 + pb-[0.75rem+安全区]"这个更矮的浮动按钮之后，pb-24
          （96px）在有底部安全区的机型上不够留（容器总高约 72px + 安全区，
          安全区较大时会逼近/超过 96px），改成了 pb-28（112px）留出稳妥
          余量；任务卡3 合并成三操作工具栏后容器高度基本没变（两侧图标
          跟中间按钮高度相近），继续沿用 pb-28，不需要再调整。 */}
      <div className="pb-28">
        {data && data.images.length > 0 ? (
          <div>
            {/* 任务卡3：沉浸式头图——高度从 aspect-[4/3] 改成 h-[50dvh]（占满
                上半屏，不是按图片比例决定高度），配合 index.html 的
                viewport-fit=cover + 上面 useEffect 里的状态栏 overlay 设置，
                让图片真正延伸到状态栏底下。relative 定位是给下面的渐变遮罩
                用的。 */}
            <div className="relative">
              <div
                data-testid="post-image-carousel"
                onScroll={handleCarouselScroll}
                className="flex h-[50dvh] snap-x snap-mandatory overflow-x-auto"
              >
                {imagesWithLightboxIndex.map(({ id: imageId, publicUrl, lightboxIndex: indexInLightbox }) => (
                  <button
                    key={imageId}
                    type="button"
                    aria-label="查看大图"
                    disabled={indexInLightbox === null}
                    onClick={() => {
                      if (indexInLightbox !== null) {
                        setLightboxIndex(indexInLightbox);
                      }
                    }}
                    className="block h-full w-full flex-none snap-center disabled:cursor-default"
                  >
                    <img
                      src={publicUrl ?? undefined}
                      alt={data.title}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
              {/* 渐变遮罩：不管照片本身明暗，状态栏区域始终有一层半透明黑
                  打底，配合上面 useEffect 设的 Style.Dark（白色图标），保证
                  时间/信号/电量图标在任何照片背景下都清晰可见——见任务卡3
                  文档注释里"为什么不按图片明暗动态判断"的说明。 */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent"
              />
            </div>
            {data.images.length > 1 ? (
              <p className="mt-2 text-center text-xs text-text-muted">
                {currentImageIndex + 1} / {data.images.length}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mx-auto max-w-2xl px-4 py-6">
          <WechatBrowserBanner />

          {publishSuccessMessage ? (
            <p role="status" className="mb-4 text-sm text-text-muted">
              {publishSuccessMessage}
            </p>
          ) : null}

          {isPending ? <p role="status">加载中…</p> : null}

          {isError ? <p role="alert">帖子加载失败，请稍后重试。</p> : null}

          {!isPending && !isError && data === null ? (
            <>
              <h1>帖子未找到</h1>
              <p role="alert">帖子不存在或未通过审核。</p>
            </>
          ) : null}

          {!isPending && !isError && data ? (
            <div className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold text-text">{data.title}</h1>
                {priceUnset ? null : (
                  <p className="mt-1 text-2xl font-bold text-text">
                    {formatPrice(data.priceAmount, data.priceLabel, data.currencyCode)}
                  </p>
                )}
              </div>

              <p className="text-sm text-text-muted">
                {data.locationName ? formatLocationDisplayName(data.locationName) : "地区未填写"}
              </p>

              {data.contactMethod && data.contactValue ? (
                <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
                  <p className="text-text-muted">联系方式（{data.contactMethod}）</p>
                  <p className="break-words font-medium">{data.contactValue}</p>
                </div>
              ) : null}

              {/* 任务卡3：正文上方加"描述"小节标题——跟活动详情页"活动描述"
                  的写法（<h2 className="mb-1 text-sm font-semibold
                  text-text">）完全一致，改版前这里没有任何标题文字。 */}
              <div>
                <h2 className="mb-1 text-sm font-semibold text-text">描述</h2>
                <p className="whitespace-pre-wrap break-words text-sm text-text">
                  {data.description}
                </p>
              </div>

              <PersonCard
                userId={data.authorId}
                displayName={data.authorDisplayName}
                avatarUrl={data.authorAvatarUrl}
                subtitle={`发布于 ${formatRelativeTimeAgo(data.createdAt)}`}
              />
            </div>
          ) : null}

          {id ? <CommentSection postId={id} /> : null}

          {lightboxIndex !== null ? (
            <ImageLightbox
              images={lightboxImages}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          ) : null}
        </div>
      </div>

      {/* 任务卡3：固定底部工具栏——分享/咨询/收藏合并成同一条，取代原来
          "内容区一行分享/收藏/举报图标"+"单独 fixed 的咨询按钮"这两块。
          容器本身的 fixed 定位、白底+顶部细边框、安全区适配（原来任务卡2
          留下的 pt-3 + pb-[0.75rem+安全区]）都不变。

          不再用 empty:hidden：ContactSellerButton 在作者查看自己帖子时
          仍然内部返回 null（组件逻辑没动），但容器现在总有分享+收藏两个
          图标子节点，DOM 层面永远不会真的是空的，:empty 选择器不会再命中
          ——直接始终渲染整条工具栏，author 查看自己帖子时自然就是"分享+
          收藏两个图标"，不需要在这个页面里额外判断一次"我是不是作者"。

          整条工具栏（连同下面的正文）都挂在 data 加载成功之后才渲染——
          分享需要 data.title/价格拼分享文案，帖子还没加载出来或者
          "帖子未找到"页面上出现这条工具栏没有意义（原来的容器在这两种
          状态下也会渲染，只是里面的 ContactSellerButton 自己保持隐藏；
          这次顺带修正了这一点，不算独立的额外改动，是合并三个操作后的
          自然结果）。

          中间的"咨询"按钮包了一层 flex-1 的 div 让它占满两个图标之外的
          剩余宽度——ContactSellerButton 组件本身（含它内部的 <span> 包裹
          结构）和传给它的 className 完全没变，还是任务卡2定下的 h-12 +
          rounded-xl + text-[15px] + w-full。 */}
      {id && data ? (
        <div
          data-testid="post-detail-contact-bar"
          className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-border bg-white px-4 pt-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => setIsShareSheetOpen(true)}
            className="flex flex-col items-center gap-1 text-text-muted hover:text-primary"
          >
            <Share2 size={22} aria-hidden="true" />
            <span className="text-xs">分享</span>
          </button>
          <div className="flex-1">
            <ContactSellerButton
              postId={id}
              label="咨询"
              className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <FavoriteButton postId={id} variant="icon" />
        </div>
      ) : null}

      {isShareSheetOpen && id && data ? (
        <PostShareActionSheet
          postId={id}
          onShareToWechat={() => void handleShare(data)}
          onClose={() => setIsShareSheetOpen(false)}
        />
      ) : null}
    </main>
  );
}
