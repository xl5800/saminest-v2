import { MessageCircle, Plus, Star } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useCommunityPostsInfiniteQuery } from "../../features/community/use-community-posts-query";
import { useDmvCommunityQuery } from "../../features/community/use-dmv-community-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import { useAuthStore } from "../../store/auth-store";
import {
  COMMUNITY_POST_TYPE_PILL_CLASS_NAME,
  getCommunityPostTypeLabel
} from "./community-post-type";

const SKELETON_COUNT = 4;

/**
 * 社区 Feed 页（/community，公开可浏览，不需要登录——跟首页/帖子详情页一样）。
 *
 * 静默加入：v1 只有一个 DMV 社区，不做独立的"加入社区"按钮——已登录用户进来
 * 时在后台调一次 joinCommunity（撞主键重复就当已经是成员，见
 * community-repository.ts），用户完全无感：不展示任何成功/失败提示，失败也
 * 不阻塞浏览（onError 留空）。未登录时不调用。
 *
 * 顶部用 TopBar 的 tab 变体（标题 = 社区名称，右侧一个"发布"图标按钮跳
 * /community/new）。没有用 home 变体：那个变体是"Saminest 品牌名 + 地区
 * 胶囊 + 搜索"的首页专用形态，这里既没有地区也没有搜索。未登录点发布会被
 * /community/new 路由上的 RequireAuth 挡回登录页，页面自己不判断登录态，跟
 * 全站既有规则一致。
 *
 * 列表没有复用 PostList（那个组件深度绑定 posts 表的分类/图片/价格概念），
 * 这里是页面内局部的单列文字卡片，分页用跟 post-list.tsx 完全同一套
 * "哨兵元素 + IntersectionObserver"无限滚动：哨兵只在 hasNextPage 为真时才
 * 渲染。
 */
export function CommunityFeedPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: community, isError: communityError } = useDmvCommunityQuery();
  const communityId = community?.id;

  const joinCommunity = useJoinCommunityMutation();
  const { mutate: joinCommunityMutate } = joinCommunity;
  useEffect(() => {
    if (!communityId || !userId) return;
    // 静默加入：成功/失败都不展示任何提示，见组件顶部注释。
    joinCommunityMutate({ communityId, userId });
  }, [communityId, userId, joinCommunityMutate]);

  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCommunityPostsInfiniteQuery(communityId);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

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

  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  function renderContent() {
    if (communityError || isError) {
      return <p role="alert">社区加载失败，请稍后重试。</p>;
    }

    // 社区本身（拿 id）还没返回时 communityId 是 undefined，帖子查询被
    // enabled 挡住、isPending 也为 true，统一展示骨架屏。
    if (isPending) {
      return (
        <div role="status">
          <span className="sr-only">加载中…</span>
          <div className="flex flex-col gap-3">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <div
                key={index}
                className="rounded-card-lg border border-border bg-card-white p-4 shadow-card"
              >
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="mt-2 h-5 w-4/5" />
                <Skeleton className="mt-1.5 h-4 w-full" />
                <div className="mt-3 flex items-center gap-2">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (posts.length === 0) {
      return (
        <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-text-muted">暂无帖子，欢迎发布第一条</p>
          <Link
            to="/community/new"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            去发布
          </Link>
        </div>
      );
    }

    return (
      <div>
        <div className="flex flex-col gap-3">
          {posts.map((post) => {
            const hasTitle = Boolean(post.title);
            return (
              <Link
                key={post.id}
                to={`/community/post/${post.id}`}
                className="block rounded-card-lg border border-border bg-card-white p-4 shadow-card"
              >
                <span className={COMMUNITY_POST_TYPE_PILL_CLASS_NAME}>
                  {getCommunityPostTypeLabel(post.postType)}
                </span>
                {/* 有标题：标题单行截断 + body 预览两行；没有标题：直接把
                    body 前一两行当标题用（两行截断），不再重复展示预览。
                    有封面图时在文字右侧放一张小缩略图（文字为主、图片为辅）；
                    没有封面图时不渲染任何占位块，保持纯文字卡片。 */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {hasTitle ? (
                      <>
                        <p className="mt-2 line-clamp-1 break-words text-base font-medium text-text">
                          {post.title}
                        </p>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-text-muted">
                          {post.body}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 line-clamp-2 break-words text-base font-medium text-text">
                        {post.body}
                      </p>
                    )}
                  </div>
                  {post.coverImageUrl ? (
                    <img
                      src={post.coverImageUrl}
                      alt=""
                      loading="lazy"
                      className="mt-2 h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {post.authorAvatarUrl ? (
                    <img
                      src={post.authorAvatarUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                    >
                      {post.authorDisplayName.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-text">
                    {post.authorDisplayName}
                  </span>
                  <span
                    aria-label={`${post.commentCount} 条评论`}
                    className="flex shrink-0 items-center gap-1 text-xs text-text-muted"
                  >
                    <MessageCircle aria-hidden="true" size={14} />
                    {post.commentCount}
                  </span>
                  <span
                    aria-label={`${post.favoriteCount} 人收藏`}
                    className="flex shrink-0 items-center gap-1 text-xs text-text-muted"
                  >
                    <Star aria-hidden="true" size={14} />
                    {post.favoriteCount}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        {hasNextPage ? <div ref={sentinelRef} aria-hidden="true" /> : null}
        {isFetchingNextPage ? <p role="status">加载更多…</p> : null}
      </div>
    );
  }

  return (
    <main data-testid="community-feed-page">
      <TopBar
        variant="tab"
        title={community?.name ?? "社区"}
        right={{
          icon: <Plus size={18} aria-hidden="true" />,
          label: "发布",
          onClick: () => navigate("/community/new")
        }}
      />
      <div className="mx-auto max-w-2xl px-4 py-4 pb-24 md:pb-6">{renderContent()}</div>
    </main>
  );
}
