import { Share } from "@capacitor/share";
import { Flag, Share2, X } from "lucide-react";
import { type UIEvent, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { CommentSection } from "../../components/comment-section";
import { ContactSellerButton } from "../../components/contact-seller-button";
import { FavoriteButton } from "../../components/favorite-button";
import { ImageLightbox } from "../../components/image-lightbox";
import { PersonCard } from "../../components/person-card";
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
 * 3. "举报"：这个仓库本来就有帖子举报功能——独立路由 /post/:id/report
 *    （report-post-page.tsx），改版前就以文字链接的形式挂在这个页面上,
 *    这次复用同一个路由，只是把文字链接换成图标样式、挪到新的位置，
 *    没有新增任何数据库表/迁移。
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
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as PostDetailLocationState | null;
  const publishSuccessMessage = state?.publishSuccessMessage;

  const { data, isPending, isError } = usePostDetailQuery(id ?? "");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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

      {/* 底部留出空间给下面 fixed 的"咨询"大按钮（那个按钮自己是否渲染由
          ContactSellerButton 内部决定——作者查看自己的帖子时不渲染，这里
          统一留白，own-post 场景下会多一点空白，比为了这一种情况再判断
          一次"我是不是作者"更简单）。 */}
      <div className="pb-24">
        {data && data.images.length > 0 ? (
          <div>
            <div
              data-testid="post-image-carousel"
              onScroll={handleCarouselScroll}
              className="flex snap-x snap-mandatory overflow-x-auto"
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
                  className="block w-full flex-none snap-center disabled:cursor-default"
                >
                  <img
                    src={publicUrl ?? undefined}
                    alt={data.title}
                    className="aspect-[4/3] w-full object-cover"
                  />
                </button>
              ))}
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

              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => void handleShare(data)}
                  className="flex flex-col items-center gap-1 text-text-muted hover:text-primary"
                >
                  <Share2 size={22} aria-hidden="true" />
                  <span className="text-xs">分享</span>
                </button>
                {id ? <FavoriteButton postId={id} variant="icon" /> : null}
                {id ? (
                  <Link
                    to={`/post/${id}/report`}
                    className="flex flex-col items-center gap-1 text-text-muted hover:text-danger"
                  >
                    <Flag size={22} aria-hidden="true" />
                    <span className="text-xs">举报</span>
                  </Link>
                ) : null}
              </div>

              {data.contactMethod && data.contactValue ? (
                <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
                  <p className="text-text-muted">联系方式（{data.contactMethod}）</p>
                  <p className="break-words font-medium">{data.contactValue}</p>
                </div>
              ) : null}

              <p className="whitespace-pre-wrap break-words text-sm text-text">
                {data.description}
              </p>

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

      {id ? (
        <ContactSellerButton
          postId={id}
          label="咨询"
          className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center bg-primary px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-base font-semibold text-white shadow-fab hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        />
      ) : null}
    </main>
  );
}
