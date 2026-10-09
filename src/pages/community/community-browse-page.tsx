import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { CommunityCard } from "../../components/community-card";
import { Skeleton } from "../../components/skeleton";
import { formatSelectedRegionLabel } from "../../data/us-states";
import {
  COMMUNITY_MEMBERSHIP_QUERY_KEY,
  useCommunityMembershipQuery
} from "../../features/community/use-community-membership-query";
import { useCommunityPostsTodayCountQuery } from "../../features/community/use-community-posts-today-count-query";
import { useDmvCommunityQuery } from "../../features/community/use-dmv-community-query";
import { useJoinCommunityMutation } from "../../features/community/use-join-community-mutation";
import { useAuthStore } from "../../store/auth-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { AppError } from "../../utils/app-error";

const REGION_SELECT_PATH = "/region-select";
// 阶段九：DMV 社区的帖子列表从原来的 /community 挪到了这里（见 routes.tsx）。
const DMV_COMMUNITY_PATH = "/community/dmv";
const DMV_STATE_CODES = ["DC", "MD", "VA"];

const NEARBY_UNAVAILABLE_MESSAGE =
  "目前只开放了 DMV（DC / MD / VA）一个社区，其它州还没有开放，敬请期待";
const MINE_EMPTY_MESSAGE = "你还没有加入任何社区";
const MINE_GUEST_MESSAGE = "登录后可以看到你加入的社区";
const LOAD_ERROR_MESSAGE = "社区加载失败，请稍后重试。";
const JOIN_ERROR_MESSAGE = "加入失败，请稍后重试。";
// DMV 那一行种子数据建表时没有填 description（线上是 null），卡片上的简介
// 这里兜底一句事实性的描述，不是产品文案定稿——以后在数据库里给这个社区
// 填了 description 就会自动用数据库的，不需要再改这个文件。
const DMV_DESCRIPTION_FALLBACK = "DC / MD / VA 地区华人的本地生活交流社区";
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
 * /community 是这个"浏览/发现层"，原来的 DMV 帖子列表（CommunityFeedPage）
 * 挪到了 /community/dmv，那个页面本身一行没改。
 *
 * 顶栏不用 TopBar：设计稿是左对齐的大标题"社区"（TopBar 的 tab 变体是居中
 * 标题）+ 右侧搜索图标，TopBar 没有这种形态，页面自己渲染。地区行读
 * useSelectedRegionStore、文案走 formatSelectedRegionLabel，点击跳
 * /region-select——全站地区选择只有这一个页面，不新建底部弹层。
 *
 * 三个 Tab 只是页面内本地 state，不进 URL：
 * - 附近：选中的州是 DC/MD/VA（或者没选州——null 既是新用户的默认值，也是
 *   地区选择页「全美」选项恢复到的状态，意思是"看全部内容"，DMV 社区自然
 *   应该出现）展示 DMV 卡片；选了其它州展示"暂未开放"空状态。
 * - 我的社区：查 community_members 里有没有当前用户的行（见
 *   useCommunityMembershipQuery），已加入展示 DMV 卡片，没加入展示空文案；
 *   游客提示登录。没有用"只要登录就当已加入"的简化——那样卡片上的"已加入"
 *   对没进过 Feed 的用户是假的。
 * - 发现：搜索框目前只是 UI（没接真实搜索，v1 只有一个社区，没有可搜的
 *   东西）+ 一个热门搜索 chip 直达 DMV 社区。
 *
 * 搜索图标点击：切到"发现"并聚焦搜索框。聚焦用一个一次性的
 * focusRequested 标记而不是依赖 tab 变化——否则用户之后手动切到"发现"
 * 也会被抢走焦点、弹出键盘。
 *
 * 加入：已登录调用 joinCommunity（撞主键重复就当已是成员，见仓库函数），
 * 成功后 invalidate 成员状态和社区本身（刷新成员数）；游客点"加入"跳
 * /login，跟 favorite-button.tsx 同一个模式，不在页面里判断路由权限。
 */
export function CommunityBrowsePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session)?.user.id;
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);

  const [tab, setTab] = useState<BrowseTab>("nearby");
  const [searchText, setSearchText] = useState("");
  const [focusRequested, setFocusRequested] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const { data: community, isPending: communityPending, isError: communityError } =
    useDmvCommunityQuery();
  const membership = useCommunityMembershipQuery(community?.id, userId);
  const { data: todayPostCount } = useCommunityPostsTodayCountQuery(community?.id);
  const joinCommunity = useJoinCommunityMutation();

  useEffect(() => {
    if (focusRequested && tab === "discover") {
      searchInputRef.current?.focus();
      setFocusRequested(false);
    }
  }, [focusRequested, tab]);

  const isMember = membership.data === true || joinCommunity.isSuccess;
  const joinState = joinCommunity.isPending ? "joining" : isMember ? "joined" : "join";
  const regionAllowsDmv = !selectedRegion || DMV_STATE_CODES.includes(selectedRegion.stateCode);

  function handleSearchClick(): void {
    setTab("discover");
    setFocusRequested(true);
  }

  function handleJoin(): void {
    if (!community) return;
    if (!userId) {
      navigate("/login");
      return;
    }
    if (joinCommunity.isPending) return;

    setJoinError(null);
    joinCommunity.mutate(
      { communityId: community.id, userId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: [COMMUNITY_MEMBERSHIP_QUERY_KEY, community.id, userId]
          });
          void queryClient.invalidateQueries({ queryKey: ["community", community.slug] });
        },
        onError: (error) => {
          // 跟 favorite-button.tsx 同一个原则：账号受限是明确、可操作的失败
          // 原因，直接展示；其它未知失败退回通用文案。
          setJoinError(
            error instanceof AppError && error.code === "ACCOUNT_RESTRICTED"
              ? error.message
              : JOIN_ERROR_MESSAGE
          );
        }
      }
    );
  }

  const cardSkeleton = (
    <div role="status">
      <span className="sr-only">加载中…</span>
      <div className="rounded-card-lg border border-border bg-card-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="mt-1.5 h-3 w-2/3" />
          </div>
        </div>
        <Skeleton className="mt-3 h-4 w-full" />
      </div>
    </div>
  );

  const dmvCard = community ? (
    <>
      <CommunityCard
        name={community.name}
        abbreviation={community.slug.toUpperCase()}
        memberCount={community.memberCount}
        todayPostCount={todayPostCount}
        tag="州社区"
        description={community.description ?? DMV_DESCRIPTION_FALLBACK}
        to={DMV_COMMUNITY_PATH}
        joinState={joinState}
        onJoin={handleJoin}
      />
      {joinError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {joinError}
        </p>
      ) : null}
    </>
  ) : null;

  function renderNearby() {
    if (!regionAllowsDmv) {
      return (
        <p role="status" className="px-2 py-10 text-center text-sm text-text-muted">
          {NEARBY_UNAVAILABLE_MESSAGE}
        </p>
      );
    }
    if (communityError) return <p role="alert">{LOAD_ERROR_MESSAGE}</p>;
    if (communityPending) return cardSkeleton;
    return dmvCard;
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
    if (communityError || membership.isError) return <p role="alert">{LOAD_ERROR_MESSAGE}</p>;
    if (communityPending || membership.isPending) return cardSkeleton;
    if (!isMember) {
      return (
        <p role="status" className="px-2 py-10 text-center text-sm text-text-muted">
          {MINE_EMPTY_MESSAGE}
        </p>
      );
    }
    return dmvCard;
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
        <p className="mt-4 text-sm font-medium text-text-muted">热门搜索</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            to={DMV_COMMUNITY_PATH}
            className="rounded-full border border-border bg-card-white px-3 py-1.5 text-sm text-text"
          >
            DMV 华人社区
          </Link>
        </div>
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
