import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useListCommunitiesQuery } from "../../features/community/use-list-communities-query";
import { useSearchCommunityPostsQuery } from "../../features/community/use-search-community-posts-query";
import { formatRelativeTimeAgo } from "../../utils/format";
import { useDebouncedValue } from "../../utils/use-debounced-value";
import { BrowseCommunityCard } from "../community/browse-community-card";
import { filterCommunitiesByKeyword } from "../community/community-search";

const SEARCH_DEBOUNCE_MS = 400;
const LOAD_ERROR_MESSAGE = "搜索失败，请稍后重试。";

/**
 * 全站搜索页（/search，公开可用，不需要登录）——首页顶栏的搜索图标进入。
 * 原来首页搜索图标直接跳 /community 社区浏览页当占位，现在换成真正的搜索：
 * 一个关键词同时搜两类内容，分两段展示——
 * - 社区：在 listCommunities() 结果上按名称/简介匹配（filterCommunitiesByKeyword，
 *   跟社区浏览页"发现"Tab 同一个函数），结果直接复用 BrowseCommunityCard，
 *   可以在搜索结果里直接加入/退出；
 * - 帖子：searchCommunityPosts 按标题/正文模糊匹配所有社区里对外可见的帖子。
 *
 * 输入做 400ms 防抖（跟 categories-page.tsx 的搜索同一个时长），关键词为空时
 * 不发帖子请求、只显示一行提示。
 */
export function SearchPage() {
  const [searchText, setSearchText] = useState("");
  const keyword = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS).trim();

  const {
    data: communities,
    isPending: communitiesPending,
    isError: communitiesError
  } = useListCommunitiesQuery();
  const {
    data: posts,
    isPending: postsPending,
    isError: postsError
  } = useSearchCommunityPostsQuery(keyword);

  const matchedCommunities = filterCommunitiesByKeyword(communities ?? [], keyword);

  function renderCommunities() {
    if (communitiesError) return <p role="alert" className="text-sm text-text-muted">{LOAD_ERROR_MESSAGE}</p>;
    if (communitiesPending) return <Skeleton className="h-24 w-full rounded-card-lg" />;
    if (matchedCommunities.length === 0) {
      return <p className="text-sm text-text-muted">没有找到相关社区</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {matchedCommunities.map((community) => (
          <BrowseCommunityCard key={community.id} community={community} />
        ))}
      </div>
    );
  }

  function renderPosts() {
    if (postsError) return <p role="alert" className="text-sm text-text-muted">{LOAD_ERROR_MESSAGE}</p>;
    if (postsPending) {
      return (
        <div role="status">
          <span className="sr-only">加载中…</span>
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="mt-2 h-4 w-full" />
        </div>
      );
    }
    if (!posts || posts.length === 0) {
      return <p className="text-sm text-text-muted">没有找到相关帖子</p>;
    }
    return (
      <ul>
        {posts.map((post) => (
          <li key={post.id} className="border-b border-divider py-3">
            <Link to={`/community/post/${post.id}`} className="block">
              <p className="line-clamp-2 break-words text-base font-semibold text-text">
                {post.title || post.body}
              </p>
              {post.title ? (
                <p className="mt-1 line-clamp-2 break-words text-sm text-text-muted">{post.body}</p>
              ) : null}
              <div className="mt-2 flex items-center gap-2 text-xs text-text-subtle">
                {post.communityName ? (
                  <span className="max-w-[45%] truncate rounded-full bg-primary-light px-2 py-0.5 font-medium text-primary">
                    {post.communityName}
                  </span>
                ) : null}
                <span className="min-w-0 truncate">{post.authorDisplayName}</span>
                <span className="shrink-0">{formatRelativeTimeAgo(post.createdAt)}</span>
                <span
                  aria-label={`${post.commentCount} 条评论`}
                  className="ml-auto flex shrink-0 items-center gap-1"
                >
                  <MessageCircle aria-hidden="true" size={14} />
                  {post.commentCount}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main data-testid="search-page" className="pb-24 md:pb-6">
      <TopBar variant="nav-only" title="搜索" />
      <div className="mx-auto max-w-2xl px-4 py-4">
        <input
          type="search"
          autoFocus
          aria-label="搜索社区和帖子"
          placeholder="搜索社区和帖子"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="h-13 w-full rounded-search border border-border bg-card px-4 text-base text-text shadow-search"
        />

        {keyword ? (
          <>
            <section aria-label="社区" className="mt-6">
              <h2 className="mb-3 text-sm font-semibold text-text-muted">社区</h2>
              {renderCommunities()}
            </section>
            <section aria-label="帖子" className="mt-6">
              <h2 className="mb-1 text-sm font-semibold text-text-muted">帖子</h2>
              {renderPosts()}
            </section>
          </>
        ) : (
          <p className="mt-10 text-center text-sm text-text-muted">输入关键词，搜索社区和帖子</p>
        )}
      </div>
    </main>
  );
}
