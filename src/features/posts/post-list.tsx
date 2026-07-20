import { useState } from "react";
import { Link } from "react-router-dom";

import { FavoriteButton } from "../../components/favorite-button";
import { formatPrice, formatPublishedAt } from "../../utils/format";
import { usePostsQuery } from "./use-posts-query";

export interface PostListProps {
  categoryId?: string;
}

/**
 * 可复用的帖子列表：首页和分类页都用这一个组件，靠 categoryId 区分。
 * 以后"我的帖子"、"收藏列表"如果也是"分页 + 列表项"的形态，优先扩展这里
 * 而不是照抄一份。
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
 */
export function PostList({ categoryId }: PostListProps) {
  const [page, setPage] = useState(0);
  const { data, isPending, isError } = usePostsQuery({ categoryId, page });

  if (isPending) {
    return <p role="status">加载中…</p>;
  }

  if (isError) {
    return <p role="alert">帖子加载失败，请稍后重试。</p>;
  }

  if (data.posts.length === 0) {
    return <p role="status">暂无帖子。</p>;
  }

  return (
    <div>
      <div className="columns-2 gap-3">
        {data.posts.map((post) => (
          <div
            key={post.id}
            className="mb-3 break-inside-avoid overflow-hidden rounded-lg border border-border bg-white"
          >
            <Link to={`/post/${post.id}`} className="block">
              {post.coverImageUrl ? (
                <img
                  src={post.coverImageUrl}
                  alt={post.title}
                  className="aspect-[4/3] w-full rounded-t-lg object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  data-testid="post-thumbnail-placeholder"
                  className="flex aspect-[4/3] w-full items-center justify-center rounded-t-lg bg-border text-2xl"
                >
                  🖼
                </div>
              )}
              <div className="space-y-1 p-2">
                <p className="line-clamp-2 text-sm text-text">{post.title}</p>
                <p className="font-semibold text-accent">
                  {formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-text-muted">
                    {post.categoryName}
                  </span>
                  <span className="text-xs text-text-muted">
                    {post.locationName ?? "地区未填写"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{post.authorDisplayName}</span>
                  <span>{formatPublishedAt(post.publishedAt)}</span>
                </div>
              </div>
            </Link>
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-xs text-text-muted">♥ {post.favoriteCount}</span>
              <FavoriteButton postId={post.id} />
            </div>
          </div>
        ))}
      </div>
      <div>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((current) => Math.max(0, current - 1))}
        >
          上一页
        </button>
        <button
          type="button"
          disabled={!data.hasNextPage}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
