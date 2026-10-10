import { Clipboard } from "@capacitor/clipboard";
import { BadgeCheck, Plus, Search, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { CommunityPostCard } from "../../components/community-post-card";
import { LeaveCommunityConfirmDialog } from "../../components/leave-community-confirm-dialog";
import { Skeleton } from "../../components/skeleton";
import { TopBar } from "../../components/top-bar";
import { useCommunityBySlugQuery } from "../../features/community/use-community-by-slug-query";
import { useCommunityMembershipQuery } from "../../features/community/use-community-membership-query";
import { useCommunityPostsInfiniteQuery } from "../../features/community/use-community-posts-query";
import { useSearchCommunityPostsQuery } from "../../features/community/use-search-community-posts-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import { useLeaveCommunityMutation } from "../../features/community/use-leave-community-mutation";
import { useAuthStore } from "../../store/auth-store";
import { PRODUCTION_ORIGIN } from "../../utils/constants";
import { useDebouncedValue } from "../../utils/use-debounced-value";

const SKELETON_COUNT = 4;
// 跟全站搜索页、分类页搜索同一个防抖时长。
const SEARCH_DEBOUNCE_MS = 400;

/**
 * 社区 Feed 页（/community/:slug，公开可浏览，不需要登录——跟首页/帖子详情页
 * 一样）。slug 从路由参数读（dmv / dmv-pets / dmv-students ……），页面里没有任何
 * 写死的社区。
 *
 * 结构（视觉改版，设计稿"C 社区详情"）：
 * - TopBar tab 变体：标题（社区名）+ 右侧搜索图标（社区内搜索，见下）；
 * - 社区头部：社区名 + 认证勾（官方社区才显示）+ 成员数 + 简介（都读
 *   communities 表的真实字段）+ 加入状态按钮 + 分享按钮。原来左侧的"DMV"
 *   方块缩写头像已去掉——三个社区都显示"DMV"，区分不了；
 * - 帖子列表：跟首页共用 CommunityPostCard（showCommunityTag = false：不显示
 *   社区名标签，置顶帖在那个位置显示"置顶"），首页和社区页帖子长得完全一样；
 * - 右下角悬浮的"＋ 发布"胶囊按钮。
 *
 * 加入状态：没有任何"静默自动加入"（阶段十三产品决策）——用户必须自己点头部的
 * "加入"按钮才算数。按钮状态来自真实的成员关系查询（useCommunityMembershipQuery）
 * （加入/退出成功后由 applyCommunityMembershipChange 直接写入最新值）：已是成员：
 * 描边样式的"退出"按钮，点了先弹 LeaveCommunityConfirmDialog 确认，确认后才调
 * leaveCommunity；请求进行中：禁用的"加入中…"/
 * "退出中…"；其它：可点的"加入"——已登录调 joinCommunity（撞主键重复就当已经是
 * 成员，见 community-repository.ts），失败时按钮保持可点方便重试；未登录点击跳
 * 登录页。
 *
 * 分享：复制当前页面的生产环境链接到剪贴板（@capacitor/clipboard，跟
 * post-share-action-sheet.tsx 同一个写法，纯浏览器环境自动降级成
 * navigator.clipboard），成功后在头部下面显示一行"链接已复制"；失败只写
 * 控制台，不打扰用户。链接用当前 location.pathname 拼，路由以后改路径
 * （比如 /community/dmv）不需要同步改这里。
 *
 * 发布：悬浮按钮跳 /community/:slug/new——带上当前社区，发帖页自动归属到这个
 * 社区、不显示"选择社区"下拉框；未登录会被那条路由上的 RequireAuth 挡回登录页，
 * 页面自己不判断登录态，跟全站既有规则一致。按钮位置避开底部 Tab 栏
 * （同 fab.tsx 的 bottom 偏移），列表底部预留足够 padding 不被它遮住。
 *
 * 社区内搜索：点顶栏搜索图标，在头部上方出现搜索框 + "取消"。输入（400ms 防抖）
 * 后只搜当前社区帖子的标题/正文（searchCommunityPosts 传 communityId），搜索
 * 期间隐藏社区头部和原帖子流，只显示结果；点"取消"清空关键词回到原样。
 *
 * 置顶：listCommunityPosts 已经是 pinned desc 排序，置顶帖天然在最前面，这里
 * 只负责在卡片上打"置顶"标签。帖子类型（"讨论"）蓝色标签已去掉——发帖页早就
 * 不让用户选类型了，每条都显示"讨论"没有信息量。没有做点赞（这次改版明确不做）。
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

  const { slug } = useParams<{ slug: string }>();
  const { data: community, isError: communityError } = useCommunityBySlugQuery(slug);
  const communityId = community?.id;

  const joinCommunity = useJoinCommunityMutation();
  const { mutate: joinCommunityMutate } = joinCommunity;
  const leaveCommunity = useLeaveCommunityMutation();
  const membership = useCommunityMembershipQuery(communityId, userId);

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  // 社区内搜索：顶栏右侧搜索图标打开搜索框；只搜当前社区的帖子（传 communityId），
  // 社区 id 还没加载出来时不发请求，避免退化成全站搜索。
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchKeyword = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS).trim();
  const isSearching = searchOpen && searchKeyword.length > 0;
  const searchResults = useSearchCommunityPostsQuery(searchKeyword, {
    communityId,
    enabled: searchOpen && Boolean(communityId)
  });

  function closeSearch(): void {
    setSearchOpen(false);
    setSearchText("");
  }

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
    useCommunityPostsInfiniteQuery(communityId ? [communityId] : undefined);

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

  const isJoined = Boolean(userId) && membership.data === true;

  function renderJoinButton() {
    if (joinCommunity.isPending || leaveCommunity.isPending) {
      return (
        <button
          type="button"
          disabled
          className="h-10 flex-1 rounded-full bg-primary text-sm font-semibold text-white opacity-60"
        >
          {joinCommunity.isPending ? "加入中…" : "退出中…"}
        </button>
      );
    }
    if (isJoined) {
      return (
        <button
          type="button"
          onClick={() => setConfirmLeaveOpen(true)}
          className="h-10 flex-1 rounded-full border border-border bg-card text-sm font-semibold text-text-muted"
        >
          退出
        </button>
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
        <div className="pb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
      );
    }

    return (
      <section aria-label="社区信息" className="border-b border-border pb-4">
        <div className="flex items-center gap-3">
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
        {confirmLeaveOpen ? (
          <LeaveCommunityConfirmDialog
            communityName={community.name}
            onCancel={() => setConfirmLeaveOpen(false)}
            onConfirm={() => {
              setConfirmLeaveOpen(false);
              if (userId && communityId) {
                leaveCommunity.mutate({ communityId, userId });
              }
            }}
          />
        ) : null}
      </section>
    );
  }

  function renderSearchResults() {
    if (searchResults.isError) {
      return <p role="alert">搜索失败，请稍后重试。</p>;
    }
    if (searchResults.isPending) {
      return (
        <div role="status" className="py-4">
          <span className="sr-only">搜索中…</span>
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="mt-2 h-4 w-full" />
        </div>
      );
    }
    const results = searchResults.data ?? [];
    if (results.length === 0) {
      return (
        <p role="status" className="py-10 text-center text-sm text-text-muted">
          本社区没有找到相关帖子
        </p>
      );
    }
    return (
      <div className="-mx-4">
        {results.map((post) => (
          <CommunityPostCard key={post.id} post={post} showCommunityTag={false} />
        ))}
      </div>
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
                <Skeleton className="h-5 w-4/5" />
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
            to={`/community/${slug}/new`}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            去发布
          </Link>
        </div>
      );
    }

    return (
      <div>
        {/* -mx-4：帖子卡片自带 px-4，跟首页一样分隔线铺满整行宽度。 */}
        <div className="-mx-4">
          {posts.map((post) => (
            <CommunityPostCard key={post.id} post={post} showCommunityTag={false} />
          ))}
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
          icon: <Search size={18} aria-hidden="true" />,
          label: "搜索本社区",
          onClick: () => setSearchOpen(true)
        }}
      />
      {/* 底部 padding：底部 Tab 栏（约 60px）+ 悬浮发布按钮（50px + 它离 Tab 栏的
          间隙）之上再留一点余量，最后一条帖子不会被遮住。 */}
      <div className="mx-auto max-w-2xl px-4 py-4 pb-40 md:pb-24">
        {searchOpen ? (
          <div className="mb-4 flex items-center gap-2">
            <input
              type="search"
              autoFocus
              aria-label="搜索本社区"
              placeholder={community ? `搜索${community.name}` : "搜索本社区"}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-search border border-border bg-card px-4 text-base text-text"
            />
            <button
              type="button"
              onClick={closeSearch}
              className="shrink-0 px-1 text-sm font-medium text-primary"
            >
              取消
            </button>
          </div>
        ) : null}
        {isSearching ? (
          renderSearchResults()
        ) : (
          <>
            {renderHeader()}
            {renderContent()}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => navigate(`/community/${slug}/new`)}
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
        className="fixed right-4 z-20 flex h-[50px] items-center gap-1 whitespace-nowrap rounded-full bg-primary px-5 text-base font-semibold text-white shadow-[0_6px_16px_rgba(49,91,234,0.35)]"
      >
        <Plus size={18} aria-hidden="true" />
        发布
      </button>
    </main>
  );
}
