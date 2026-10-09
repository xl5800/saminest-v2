import { Clipboard } from "@capacitor/clipboard";
import { BadgeCheck, Check, Heart, MessageCircle, Plus, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useCommunityPostsInfiniteQuery } from "../../features/community/use-community-posts-query";
import { useDmvCommunityQuery } from "../../features/community/use-dmv-community-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import { useAuthStore } from "../../store/auth-store";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import {
  COMMUNITY_POST_TYPE_PILL_CLASS_NAME,
  getCommunityPostTypeLabel
} from "./community-post-type";

const SKELETON_COUNT = 4;

/**
 * 社区 Feed 页（/community，公开可浏览，不需要登录——跟首页/帖子详情页一样）。
 *
 * 结构（视觉改版，设计稿"C 社区详情"）：
 * - TopBar tab 变体，只放标题（社区名），不再有右上角发布按钮；
 * - 社区头部：圆角方形缩写头像（slug 大写，"DMV"）+ 社区名 + 认证勾（官方
 *   社区才显示）+ 成员数 + 简介（都读 communities 表的真实字段，不在前端
 *   硬编码）+ 加入状态按钮 + 分享按钮；
 * - 扁平帖子列表（border-b 分隔，不是整张描边卡片）；
 * - 右下角悬浮的"＋ 发布"胶囊按钮。
 *
 * 加入状态：v1 只有一个 DMV 社区，已登录用户进来时在后台调一次 joinCommunity
 * （撞主键重复就当已经是成员，见 community-repository.ts），失败也不阻塞
 * 浏览。按钮据此展示——已登录且加入没有失败：纯状态展示的"✓ 已加入"（不可点，
 * 这次不做退出社区）；已登录但加入请求失败：回退成可点的"加入"重试；未登录：
 * "加入"，点击跳登录页。
 *
 * 分享：复制当前页面的生产环境链接到剪贴板（@capacitor/clipboard，跟
 * post-share-action-sheet.tsx 同一个写法，纯浏览器环境自动降级成
 * navigator.clipboard），成功后在头部下面显示一行"链接已复制"；失败只写
 * 控制台，不打扰用户。链接用当前 location.pathname 拼，路由以后改路径
 * （比如 /community/dmv）不需要同步改这里。
 *
 * 发布：悬浮按钮跳 /community/new；未登录会被那条路由上的 RequireAuth 挡回
 * 登录页，页面自己不判断登录态，跟全站既有规则一致。按钮位置避开底部 Tab 栏
 * （同 fab.tsx 的 bottom 偏移），列表底部预留足够 padding 不被它遮住。
 *
 * 置顶：listCommunityPosts 已经是 pinned desc 排序，置顶帖天然在最前面，这里
 * 只负责在卡片上打"置顶"标签。没有做点赞（这次改版明确不做）。
 *
 * 列表没有复用 PostList（那个组件深度绑定 posts 表的分类/图片/价格概念），
 * 分页用跟 post-list.tsx 完全同一套"哨兵元素 + IntersectionObserver"无限
 * 滚动：哨兵只在 hasNextPage 为真时才渲染。
 */
export function CommunityFeedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  const { data: community, isError: communityError } = useDmvCommunityQuery();
  const communityId = community?.id;

  const joinCommunity = useJoinCommunityMutation();
  const { mutate: joinCommunityMutate } = joinCommunity;
  useEffect(() => {
    if (!communityId || !userId) return;
    // 静默加入：成功/失败都不展示提示，见组件顶部注释。
    joinCommunityMutate({ communityId, userId });
  }, [communityId, userId, joinCommunityMutate]);

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  async function handleShare(): Promise<void> {
    setShareFeedback(null);
    try {
      await Clipboard.write({ string: `${PRODUCTION_ORIGIN}${location.pathname}` });
      setShareFeedback("链接已复制");
    } catch (error) {
      // 复制失败不是用户能操作纠正的场景（权限被拒绝之类），静默吞掉、只留
      // 控制台日志——跟 post-share-action-sheet.tsx 同一个态度。
      console.error("复制链接失败：", error);
    }
  }

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

  const isJoined = Boolean(userId) && !joinCommunity.isError;

  function renderJoinButton() {
    if (isJoined) {
      return (
        <span className="flex h-10 flex-1 items-center justify-center gap-1 rounded-full bg-primary-light text-sm font-semibold text-primary">
          <Check size={16} aria-hidden="true" />
          已加入
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          if (!userId) {
            navigate("/login");
          } else if (communityId) {
            joinCommunityMutate({ communityId, userId });
          }
        }}
        className="h-10 flex-1 rounded-full bg-primary text-sm font-semibold text-white hover:bg-primary-hover"
      >
        加入
      </button>
    );
  }

  function renderHeader() {
    if (!community) {
      if (communityError) return null;
      return (
        <div className="flex items-center gap-3 pb-4">
          <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-2xl" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-24" />
          </div>
        </div>
      );
    }

    return (
      <section aria-label="社区信息" className="border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-primary-light text-sm font-bold text-primary"
          >
            {community.slug.toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="truncate text-lg font-bold text-text">{community.name}</p>
              {community.isOfficial ? (
                <BadgeCheck
                  size={18}
                  aria-label="官方认证"
                  className="shrink-0 text-primary"
                />
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-text-muted">{community.memberCount} 位成员</p>
          </div>
        </div>
        {community.description ? (
          <p className="mt-3 text-sm text-text-muted">{community.description}</p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          {renderJoinButton()}
          <button
            type="button"
            aria-label="分享"
            onClick={() => void handleShare()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-text"
          >
            <Share2 size={18} aria-hidden="true" />
          </button>
        </div>
        {shareFeedback ? (
          <p role="status" className="mt-2 text-xs text-text-muted">
            {shareFeedback}
          </p>
        ) : null}
      </section>
    );
  }

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
          <div className="flex flex-col">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <div key={index} className="border-b border-border py-4">
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
        <div className="flex flex-col">
          {posts.map((post) => {
            const hasTitle = Boolean(post.title);
            return (
              <Link
                key={post.id}
                to={`/community/post/${post.id}`}
                className="block border-b border-border py-4"
              >
                <div className="flex items-center gap-1.5">
                  {post.pinned ? (
                    <span className="inline-block rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                      置顶
                    </span>
                  ) : null}
                  <span className={COMMUNITY_POST_TYPE_PILL_CLASS_NAME}>
                    {getCommunityPostTypeLabel(post.postType)}
                  </span>
                </div>
                {/* 有标题：标题单行截断 + body 预览两行；没有标题：直接把
                    body 前一两行当标题用（两行截断），不再重复展示预览。
                    有封面图时在文字右侧放一张小缩略图（文字为主、图片为辅）；
                    没有封面图时不渲染任何占位块，保持纯文字。 */}
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
                    <Heart aria-hidden="true" size={14} />
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
      <TopBar variant="tab" title={community?.name ?? "社区"} />
      {/* 底部 padding：底部 Tab 栏（约 60px）+ 悬浮发布按钮（50px + 它离 Tab 栏的
          间隙）之上再留一点余量，最后一条帖子不会被遮住。 */}
      <div className="mx-auto max-w-2xl px-4 py-4 pb-40 md:pb-24">
        {renderHeader()}
        {renderContent()}
      </div>
      <button
        type="button"
        onClick={() => navigate("/community/new")}
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        className="fixed right-4 z-20 flex h-[50px] items-center gap-1 whitespace-nowrap rounded-full bg-primary px-5 text-base font-semibold text-white shadow-[0_6px_16px_rgba(49,91,234,0.35)]"
      >
        <Plus size={18} aria-hidden="true" />
        发布
      </button>
    </main>
  );
}
