import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { FavoriteButton } from "../../components/favorite-button";
import { formatListingDate, formatPrice } from "../../utils/format";
import { usePostsQuery } from "./use-posts-query";

export interface PostListProps {
  categoryId?: string;
  searchQuery?: string;
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
export function PostList({ categoryId, searchQuery }: PostListProps) {
  const [page, setPage] = useState(0);

  // 搜索词变化时要把分页重置回第 0 页：否则用户翻到无过滤列表第 3 页后再
  // 输入搜索词，会拿着"第 3 页"这个 page 值去查过滤后的结果，而过滤后的
  // 结果可能根本没有第 3 页。只在 searchQuery 变化时触发，不能让这个
  // effect 在其它无关的重新渲染上也把 page 重置掉。
  useEffect(() => {
    setPage(0);
  }, [searchQuery]);

  const { data, isPending, isError } = usePostsQuery({ categoryId, searchQuery, page });

  if (isPending) {
    return <p role="status">加载中…</p>;
  }

  if (isError) {
    return <p role="alert">帖子加载失败，请稍后重试。</p>;
  }

  if (data.posts.length === 0) {
    return <p role="status">{searchQuery ? "没有找到相关帖子。" : "暂无帖子。"}</p>;
  }

  return (
    <div>
      <div className="columns-2 gap-3">
        {data.posts.map((post) => (
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
