import { Share } from "@capacitor/share";
import { type UIEvent, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { CommentSection } from "../../components/comment-section";
import { ContactSellerButton } from "../../components/contact-seller-button";
import { FavoriteButton } from "../../components/favorite-button";
import { ImageLightbox } from "../../components/image-lightbox";
import { WechatBrowserBanner } from "../../components/wechat-browser-banner";
import { usePostDetailQuery } from "../../features/posts/use-post-detail-query";
import type { PostDetail } from "../../repositories/posts-repository";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import { formatListingDate, formatPrice } from "../../utils/format";

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
 * 图片区是横向大图轮播，不是原来的两列小图网格：用原生 CSS scroll-snap
 * （横向 overflow-x-auto 容器 + snap-x snap-mandatory、每张图 snap-center
 * + flex-none w-full）实现，不引入额外的手势/轮播库。当前滑到第几张靠
 * onScroll 读容器的 scrollLeft / 容器宽度换算，驱动底部"1 / N"计数
 * 指示器（只有 1 张图时不显示，跟 ImageLightbox 自己"只有一张图不显示
 * 计数/切换按钮"的判断是同一个逻辑）。点击当前这张大图打开的还是
 * ImageLightbox 全屏查看器，触发方式从"点小图格"变成"点当前大图"，
 * ImageLightbox 组件本身没有改动。
 *
 * 页面信息排布顺序：图片轮播 → 价格（放大突出）→ 标题 → 描述 → 次要信息
 * （分类/地区/发布时间/作者，字号调小、加大行间距——这几项对买家来说
 * 是"看一眼图和价格就能判断感不感兴趣"之外的次要信息，不需要跟标题挤在
 * 最上面）。联系方式/收藏/举报按钮和评论区顺序不变，仍然在这块之后。
 *
 * "分享"按钮用官方 @capacitor/share 插件调系统原生分享面板，不接入微信
 * SDK；这个插件在纯浏览器环境下会自动降级用标准 Web Share API
 * （navigator.share()），网页版访问详情页也能用同一个按钮，不用写
 * App/网页两套逻辑。分享链接见上面 PRODUCTION_ORIGIN 的注释——不能用
 * window.location.origin 拼。这一批只做"分享到微信/更多应用"这一个
 * 入口，站内分享给好友（比如分享进站内私信）不在这次范围内，等这个上线
 * 后再单独出任务卡。
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
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
          {data.images.length > 0 ? (
            <div>
              <div
                data-testid="post-image-carousel"
                onScroll={handleCarouselScroll}
                className="flex snap-x snap-mandatory overflow-x-auto rounded-lg"
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

          <div>
            <p className="text-2xl font-bold text-text">
              {formatPrice(data.priceAmount, data.priceLabel, data.currencyCode)}
            </p>
            <h1 className="mt-1 text-lg font-semibold text-text">{data.title}</h1>
          </div>

          <p className="whitespace-pre-wrap break-words text-sm text-text">
            {data.description}
          </p>

          <div className="space-y-3 border-t border-border pt-4 text-xs text-text-muted">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-text-muted">
                {data.categoryName}
              </span>
              <span>{data.locationName ?? "地区未填写"}</span>
            </div>
            <p>{formatListingDate(data.createdAt)}</p>
            <p>发布者：{data.authorDisplayName}</p>
          </div>

          {data.contactMethod && data.contactValue ? (
            <div className="rounded-lg border border-border bg-bg p-3 text-sm text-text">
              <p className="text-text-muted">联系方式（{data.contactMethod}）</p>
              <p className="break-words font-medium">{data.contactValue}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        {id ? <FavoriteButton postId={id} /> : null}
        {id ? <ContactSellerButton postId={id} /> : null}
        {id ? (
          <Link
            to={`/post/${id}/report`}
            className="text-sm text-text-muted hover:text-danger hover:underline"
          >
            举报
          </Link>
        ) : null}
        {id && data ? (
          <button
            type="button"
            onClick={() => void handleShare(data)}
            className="text-sm text-text-muted hover:text-primary hover:underline"
          >
            分享
          </button>
        ) : null}
      </div>

      {id ? <CommentSection postId={id} /> : null}

      {lightboxIndex !== null ? (
        <ImageLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </main>
  );
}
