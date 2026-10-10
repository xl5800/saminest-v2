import { ChevronRight, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Skeleton } from "../../components/skeleton";
import { formatSelectedRegionLabel } from "../../data/us-states";
import { useListCommunitiesQuery } from "../../features/community/use-list-communities-query";
import { useMyCommunitiesQuery } from "../../features/community/use-my-communities-query";
import type { Community } from "../../repositories/community-repository";
import { useAuthStore } from "../../store/auth-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { BrowseCommunityCard } from "./browse-community-card";
import { filterCommunitiesByKeyword } from "./community-search";

const REGION_SELECT_PATH = "/region-select";
function getCommunityPath(slug: string): string {
  return `/community/${slug}`;
}

const NEARBY_UNAVAILABLE_MESSAGE =
  "目前只开放了 DMV（DC / MD / VA）地区的社区，其它州还没有开放，敬请期待";
const MINE_EMPTY_MESSAGE = "你还没有加入任何社区";
const MINE_GUEST_MESSAGE = "登录后可以看到你加入的社区";
const LOAD_ERROR_MESSAGE = "社区加载失败，请稍后重试。";
const SEARCH_EMPTY_MESSAGE = "没有找到相关社区";
const REGION_PLACEHOLDER = "选择地区";

type BrowseTab = "nearby" | "mine" | "discover";

const TAB_OPTIONS: { value: BrowseTab; label: string }[] = [
  { value: "nearby", label: "附近" },
  { value: "mine", label: "我的社区" },
  { value: "discover", label: "发现" }
];

// 跟 top-bar.tsx 里 ICON_BUTTON_CLASS_NAME 同一套 icon-button 样式（那个常量
// 没有导出，这里照抄一份，不为这一处样式去改 top-bar.tsx 的导出）。
const ICON_BUTTON_CLASS_NAME =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-text";

/**
 * 社区浏览页（/community，公开可浏览，不需要登录）。阶段九把路由拆成两级：
 * /community 是这个"浏览/发现层"，单个社区的帖子列表（CommunityFeedPage）
 * 在 /community/:slug。阶段十三起支持多个社区（DMV 华人 / 宠物 / 留学生），
 * 页面里没有写死任何社区。
 *
 * 顶栏不用 TopBar：设计稿是左对齐的大标题"社区"（TopBar 的 tab 变体是居中
 * 标题）+ 右侧搜索图标，TopBar 没有这种形态，页面自己渲染。地区行读
 * useSelectedRegionStore、文案走 formatSelectedRegionLabel，点击跳
 * /region-select——全站地区选择只有这一个页面，不新建底部弹层。
 *
 * 三个 Tab 只是页面内本地 state，不进 URL（唯一例外：进入页面时读一次 ?tab=，
 * 首页菜单的"我的社区"用 ?tab=mine 直接打开"我的社区"Tab）：
 * - 附近：listCommunities() 拿到全部社区，用选中的州代码去匹配每个社区自己的
 *   stateCodes（communities.state_codes），匹配上的都渲染成卡片（DC 用户会同时
 *   看到三个 DMV 社区）。没选州（null 既是新用户的默认值，也是地区选择页「全美」
 *   选项恢复到的状态，意思是"看全部内容"）时展示全部社区；选了州但一个社区都
 *   没匹配上，展示"暂未开放"空状态。
 * - 我的社区：listMyCommunities(userId) 一次拿到当前用户已加入的全部社区
 *   （community_members 内嵌 communities），逐个渲染卡片；一个都没有展示空文案；
 *   游客提示登录。
 * - 发现：社区搜索框——输入关键词后按社区名称/简介匹配（filterCommunitiesByKeyword，
 *   只搜社区、不搜帖子；帖子搜索在全站搜索页 /search），结果渲染成社区卡片；
 *   没输入时展示每个社区一个热门搜索 chip 直达对应社区。
 *
 * 搜索图标点击：切到"发现"并聚焦搜索框。聚焦用一个一次性的
 * focusRequested 标记而不是依赖 tab 变化——否则用户之后手动切到"发现"
 * 也会被抢走焦点、弹出键盘。
 *
 * 加入/退出逻辑在 BrowseCommunityCard 里（每张卡片各自一份状态，见
 * browse-community-card.tsx）。
 */
export function CommunityBrowsePage() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.session)?.user.id;
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  // 首页菜单的"我的社区"跳 /community?tab=mine，直接打开对应 Tab；之后在页面里
  // 切 Tab 仍然只是本地 state，不写回 URL。
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<BrowseTab>(
    TAB_OPTIONS.some((option) => option.value === initialTab) ? (initialTab as BrowseTab) : "nearby"
  );
  const [searchText, setSearchText] = useState("");
  const [focusRequested, setFocusRequested] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const {
    data: communities,
    isPending: communitiesPending,
    isError: communitiesError
  } = useListCommunitiesQuery();
  const {
    data: myCommunities,
    isPending: myCommunitiesPending,
    isError: myCommunitiesError
  } = useMyCommunitiesQuery(userId);

  useEffect(() => {
    if (focusRequested && tab === "discover") {
      searchInputRef.current?.focus();
      setFocusRequested(false);
    }
  }, [focusRequested, tab]);

  const nearbyCommunities = (communities ?? []).filter(
    (community) => !selectedRegion || community.stateCodes.includes(selectedRegion.stateCode)
  );

  function handleSearchClick(): void {
    setTab("discover");
    setFocusRequested(true);
  }

  const cardSkeleton = (
    <div role="status">
      <span className="sr-only">加载中…</span>
      <div className="rounded-card-lg border border-border bg-card-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="mt-1.5 h-3 w-2/3" />
          </div>
        </div>
        <Skeleton className="mt-3 h-4 w-full" />
      </div>
    </div>
  );

  function renderCardList(list: Community[]) {
    return (
      <div className="flex flex-col gap-3">
        {list.map((community) => (
          <BrowseCommunityCard key={community.id} community={community} />
        ))}
      </div>
    );
  }

  function renderNearby() {
    if (communitiesError) return <p role="alert">{LOAD_ERROR_MESSAGE}</p>;
    if (communitiesPending) return cardSkeleton;
    if (nearbyCommunities.length === 0) {
      return (
        <p role="status" className="px-2 py-10 text-center text-sm text-text-muted">
          {NEARBY_UNAVAILABLE_MESSAGE}
        </p>
      );
    }
    return renderCardList(nearbyCommunities);
  }

  function renderMine() {
    if (!userId) {
      return (
        <p role="status" className="px-2 py-10 text-center text-sm text-text-muted">
          {MINE_GUEST_MESSAGE}，
          <Link to="/login" className="text-primary hover:underline">
            去登录
          </Link>
        </p>
      );
    }
    if (myCommunitiesError) return <p role="alert">{LOAD_ERROR_MESSAGE}</p>;
    if (myCommunitiesPending) return cardSkeleton;
    if (!myCommunities || myCommunities.length === 0) {
      return (
        <p role="status" className="px-2 py-10 text-center text-sm text-text-muted">
          {MINE_EMPTY_MESSAGE}
        </p>
      );
    }
    return renderCardList(myCommunities);
  }

  function renderDiscoverResults() {
    if (communitiesError) return <p role="alert">{LOAD_ERROR_MESSAGE}</p>;
    if (communitiesPending) return cardSkeleton;

    if (!searchText.trim()) {
      return (
        <>
          <p className="mt-4 text-sm font-medium text-text-muted">热门搜索</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(communities ?? []).map((community) => (
              <Link
                key={community.id}
                to={getCommunityPath(community.slug)}
                className="rounded-full border border-border bg-card-white px-3 py-1.5 text-sm text-text"
              >
                {community.name}
              </Link>
            ))}
          </div>
        </>
      );
    }

    const matched = filterCommunitiesByKeyword(communities ?? [], searchText);
    if (matched.length === 0) {
      return (
        <p role="status" className="px-2 py-10 text-center text-sm text-text-muted">
          {SEARCH_EMPTY_MESSAGE}
        </p>
      );
    }
    return <div className="mt-4">{renderCardList(matched)}</div>;
  }

  function renderDiscover() {
    return (
      <div>
        <input
          ref={searchInputRef}
          type="search"
          aria-label="搜索社区"
          placeholder="搜索社区"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="h-13 w-full rounded-search border border-border bg-card px-4 text-base text-text shadow-search"
        />
        {renderDiscoverResults()}
      </div>
    );
  }

  return (
    <main data-testid="community-browse-page" className="pb-24 md:pb-6">
      <header className="flex h-14 items-center justify-between px-4">
        <h1 className="text-2xl font-semibold text-primary">社区</h1>
        <button
          type="button"
          aria-label="搜索"
          onClick={handleSearchClick}
          className={ICON_BUTTON_CLASS_NAME}
        >
          <Search size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        <button
          type="button"
          onClick={() => navigate(REGION_SELECT_PATH)}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-card-white px-3 py-2.5 text-left text-sm text-text"
        >
          <MapPin aria-hidden="true" size={16} className="shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 truncate">
            {selectedRegion ? formatSelectedRegionLabel(selectedRegion) : REGION_PLACEHOLDER}
          </span>
          <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-chevron" />
        </button>

        <div role="tablist" aria-label="社区分类" className="mt-3 flex gap-2">
          {TAB_OPTIONS.map((option) => {
            const active = tab === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(option.value)}
                className={
                  active
                    ? "flex h-9 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold whitespace-nowrap text-white"
                    : "flex h-9 shrink-0 items-center justify-center rounded-full border border-border bg-bg px-4 text-sm whitespace-nowrap text-text-muted"
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="mt-4">
          {tab === "nearby" ? renderNearby() : null}
          {tab === "mine" ? renderMine() : null}
          {tab === "discover" ? renderDiscover() : null}
        </div>
      </div>
    </main>
  );
}
