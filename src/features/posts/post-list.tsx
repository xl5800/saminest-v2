import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { FavoriteButton } from "../../components/favorite-button";
import { formatListingDate, formatPrice } from "../../utils/format";
import { usePostsInfiniteQuery } from "./use-posts-query";

export interface PostListProps {
  categoryId?: string;
  searchQuery?: string;
}

/**
 * 可复用的帖子列表：首页和分类页都用这一个组件，靠 categoryId 区分。
 * 以后"我的帖子"、"收藏列表"如果也是"无限滚动 + 列表项"的形态，优先扩展
 * 这里而不是照抄一份。
 *
 * 渲染成"瀑布流双列"卡片网格：用原生 CSS 多栏布局（columns-2）而不是
 * CSS grid——grid 会强制同一行的卡片等高，做不出瀑布流那种"高矮不一、
 * 哪栏矮就往哪栏排"的效果；也不引入额外的 JS masonry 库，多栏布局本身
 * 就能达到效果。每张卡片加 break-inside-avoid，防止内容被从中间断开
 * 到下一栏。
 *
 * FavoriteButton 保持跟改版之前一样，不嵌套在 <Link> 里面（<Link> 渲染成
 * <a>，button 嵌套在 a 里本身是不合法的 HTML，且会干扰它自己的
 * stopPropagation 逻辑），而是作为 <Link> 的同级兄弟节点放在卡片内。
 *
 * 分页按钮已经删掉了（今晚早些时候的改动），这里用"哨兵元素 +
 * IntersectionObserver"实现无限滚动：列表底部放一个不可见的哨兵 div，
 * 它进入视口时触发 fetchNextPage()。哨兵只在 hasNextPage 为真时渲染——
 * 没有下一页时彻底不挂这个元素，而不是渲染出来但不响应，避免它一直
 * 空占着 DOM/被观察却永远不会有意义地触发。
 */
export function PostList({ categoryId, searchQuery }: PostListProps) {
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePostsInfiniteQuery({ categoryId, searchQuery });

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) {
    return <p role="status">加载中…</p>;
  }

  if (isError) {
    return <p role="alert">帖子加载失败，请稍后重试。</p>;
  }

  const posts = data.pages.flatMap((page) => page.posts);

  if (posts.length === 0) {
    return <p role="status">{searchQuery ? "没有找到相关帖子。" : "暂无帖子。"}</p>;
  }

  return (
    <div>
      <div className="columns-2 gap-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-border bg-white shadow-card"
          >
            <Link to={`/post/${post.id}`} className="block">
              {post.coverImageUrl ? (
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="aspect-[4/3] w-full rounded-t-2xl object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  data-testid="post-thumbnail-placeholder"
                  className="flex aspect-[4/3] w-full items-center justify-center rounded-t-2xl bg-border text-2xl"
                >
                  🖼
                </div>
              )}
              <div className="space-y-1 p-3">
                <p className="line-clamp-2 break-words text-base text-text">{post.title}</p>
                <p className="text-lg font-semibold text-accent">
                  {formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs font-medium text-text-muted">
                    {post.categoryName}
                  </span>
                  <span className="text-xs text-text-muted">
                    {post.locationName ?? "地区未填写"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{post.authorDisplayName}</span>
                  <span>{formatListingDate(post.createdAt)}</span>
                </div>
              </div>
            </Link>
            <div className="flex items-center justify-between px-3 pb-3">
              <span className="text-xs text-text-muted">♥ {post.favoriteCount}</span>
              <FavoriteButton postId={post.id} />
            </div>
          </div>
        ))}
      </div>
      {hasNextPage ? <div ref={sentinelRef} aria-hidden="true" /> : null}
      {isFetchingNextPage ? <p role="status">加载更多…</p> : null}
    </div>
  );
}
