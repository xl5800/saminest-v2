import { useState } from "react";
import { Link } from "react-router-dom";

import { formatPrice, formatPublishedAt } from "../../utils/format";
import { usePostsQuery } from "./use-posts-query";

export interface PostListProps {
  categoryId?: string;
}

/**
 * 可复用的帖子列表：首页和分类页都用这一个组件，靠 categoryId 区分。
 * 以后"我的帖子"、"收藏列表"如果也是"分页 + 列表项"的形态，优先扩展这里
 * 而不是照抄一份。
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
      <ul>
        {data.posts.map((post) => (
          <li key={post.id}>
            <Link to={`/post/${post.id}`}>
              <div aria-hidden="true" data-testid="post-thumbnail-placeholder" />
              <span>{post.title}</span>
              <span>{formatPrice(post.priceAmount, post.priceLabel, post.currencyCode)}</span>
              <span>{post.locationName ?? "地区未填写"}</span>
              <span>{formatPublishedAt(post.publishedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
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
