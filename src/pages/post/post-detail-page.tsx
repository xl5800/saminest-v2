import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { CommentSection } from "../../components/comment-section";
import { ContactSellerButton } from "../../components/contact-seller-button";
import { FavoriteButton } from "../../components/favorite-button";
import { ImageLightbox } from "../../components/image-lightbox";
import { usePostDetailQuery } from "../../features/posts/use-post-detail-query";
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
 */
export function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = location.state as PostDetailLocationState | null;
  const publishSuccessMessage = state?.publishSuccessMessage;

  const { data, isPending, isError } = usePostDetailQuery(id ?? "");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 传给 ImageLightbox 的图片数组要先过滤掉 publicUrl 是 null 的项（类型是
  // string | null），点击某一张缩略图时传的 initialIndex 必须是"过滤后
  // 数组里的索引"，不能直接用 data.images 里的原始下标——如果中间有图片
  // publicUrl 是 null 被过滤掉了，两个下标会对不上，点第 3 张缩略图会打开
  // 另一张图。这里单次遍历同时算出 lightboxImages（喂给 ImageLightbox 的
  // 纯 URL 数组）和每张缩略图对应的 lightboxIndex（publicUrl 是 null 时
  // 为 null，缩略图按钮据此禁用，不触发打开查看器）。
  const lightboxImages: string[] = [];
  const imagesWithLightboxIndex = (data?.images ?? []).map((image) => {
    if (image.publicUrl === null) {
      return { ...image, lightboxIndex: null as number | null };
    }
    const indexInLightbox = lightboxImages.length;
    lightboxImages.push(image.publicUrl);
    return { ...image, lightboxIndex: indexInLightbox };
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
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
            <h1 className="mb-2 text-xl font-bold text-text">{data.title}</h1>
            <p className="text-lg font-semibold text-text">
              {formatPrice(data.priceAmount, data.priceLabel, data.currencyCode)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-text-muted">
                {data.categoryName}
              </span>
              <span className="text-xs text-text-muted">
                {data.locationName ?? "地区未填写"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
              <span>{data.authorDisplayName}</span>
              <span>{formatListingDate(data.createdAt)}</span>
            </div>
          </div>

          {data.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
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
                  className="block disabled:cursor-default"
                >
                  <img
                    src={publicUrl ?? undefined}
                    alt={data.title}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}

          <p className="whitespace-pre-wrap break-words text-sm text-text">
            {data.description}
          </p>

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
