import { Briefcase, Handshake, Home, type LucideIcon, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { hideSplashScreen } from "../../app/splash-screen";

import { TopBar } from "../../components/top-bar";
import { formatShortRegionLabel } from "../../data/us-states";
import { ActivityFeed } from "../../features/activities/activity-feed";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import {
  HIRING_CATEGORY_SLUG,
  JOB_SEEKING_CATEGORY_SLUG
} from "../../features/posts/job-fields";
import { PostList } from "../../features/posts/post-list";
import { useSelectedRegionStore } from "../../store/selected-region-store";

const REGION_SELECT_PATH = "/region-select";
const SEARCH_PATH = "/search";

export type HomeTab = "jobs" | "housing" | "used" | "buddies";

export const HOME_TABS: Array<{ key: HomeTab; label: string; Icon: LucideIcon }> = [
  { key: "jobs", label: "招聘求职", Icon: Briefcase },
  { key: "housing", label: "房屋租售", Icon: Home },
  { key: "used", label: "二手闲置", Icon: ShoppingBag },
  { key: "buddies", label: "找搭子", Icon: Handshake }
];

const DEFAULT_TAB: HomeTab = "jobs";

/** 记住上次停在哪个标签（从帖子详情返回、下次打开 App 都回到同一个标签）。
 *  只是个人便利，读写失败（隐私模式等）就当没记过，回到默认的招聘求职。 */
export const HOME_TAB_STORAGE_KEY = "saminest.home-tab";

function readStoredTab(): HomeTab {
  try {
    const stored = window.localStorage.getItem(HOME_TAB_STORAGE_KEY);
    return HOME_TABS.some((tab) => tab.key === stored) ? (stored as HomeTab) : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

function writeStoredTab(tab: HomeTab): void {
  try {
    window.localStorage.setItem(HOME_TAB_STORAGE_KEY, tab);
  } catch {
    // 存不了就算了，不影响切换本身。
  }
}

type JobFilter = "all" | typeof HIRING_CATEGORY_SLUG | typeof JOB_SEEKING_CATEGORY_SLUG;
type HousingFilter = "rent" | "wanted";

const JOB_FILTERS: Array<{ key: JobFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: HIRING_CATEGORY_SLUG, label: "招聘" },
  { key: JOB_SEEKING_CATEGORY_SLUG, label: "求职" }
];

const HOUSING_FILTERS: Array<{ key: HousingFilter; label: string }> = [
  { key: "rent", label: "出租" },
  { key: "wanted", label: "求租" }
];

function FilterChips<K extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 px-4 pb-2 pt-3">
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.key)}
            className={`flex h-8 items-center rounded-full px-3.5 text-sm whitespace-nowrap ${
              selected ? "bg-primary-light font-semibold text-primary" : "bg-field text-text-body"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 首页（`/`）——首页改版（招聘求职任务卡）起是四个分类标签的信息流。
 *
 * 之前首页是社区聚合 Feed，现在社区有底部导航自己的"社区"Tab，首页改成
 * 本地生活信息：招聘求职（默认、第一个）· 房屋租售 · 二手闲置 · 找搭子。
 * 这几类帖子格式不一样（工作帖是文字行、租房 / 二手是图片网格、求租是
 * 文字卡片、找搭子是活动卡片），不能混在一个流里，所以用标签分开，每个
 * 标签用各自的列表格式：
 * - 招聘求职：全部 / 招聘 / 求职 三个小筛选，PostList 的 job 文字行；
 *   没有内容时显示"还没有工作信息，你要招人吗？免费发布"。
 * - 房屋租售：出租（图片网格）/ 求租（文字卡片），原来分类页的两种格式。
 * - 二手闲置：图片网格。
 * - 找搭子：跟 /activities 同一个 ActivityFeed（频道筛选 + 活动卡片）。
 *
 * 顶栏：左边是地区（"DMV ⌄"，点了去 /region-select），右边是搜索；不再显示
 * "华邻"品牌名，"＋"发布挪到了底部导航中间。四个标签固定在顶栏下面
 * （TopBar 的 bottomSlot），跟顶栏是同一张吸顶卡片。
 *
 * 地区筛选：每个标签都按当前选中的州过滤（跟原来分类页、找搭子页同一个
 * useSelectedRegionStore）。
 */
export function HomePage() {
  const navigate = useNavigate();
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);
  const stateCode = selectedRegion?.stateCode;
  const [tab, setTab] = useState<HomeTab>(readStoredTab);
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
  const [housingFilter, setHousingFilter] = useState<HousingFilter>("rent");

  const { data: categories, isPending: categoriesPending, isError: categoriesError } =
    useCategoriesQuery();
  const categoryIdBySlug = new Map((categories ?? []).map((category) => [category.slug, category.id]));

  // 启动图：分类查回来（成功或失败）再收起——各标签的列表都要先知道分类 id；
  // 找搭子标签不依赖分类，直接收起。hideSplashScreen 只有第一次调用生效。
  useEffect(() => {
    if (tab === "buddies" || !categoriesPending) {
      hideSplashScreen();
    }
  }, [tab, categoriesPending]);

  function selectTab(next: HomeTab): void {
    setTab(next);
    writeStoredTab(next);
    window.scrollTo({ top: 0 });
  }

  function publish(categorySlug: string): void {
    navigate(`/publish?category=${categorySlug}`);
  }

  function renderJobsEmptyState(filter: JobFilter) {
    const seeking = filter === JOB_SEEKING_CATEGORY_SLUG;
    return (
      <div role="status" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-base text-text-body">
          {seeking ? "还没有求职信息，你在找工作吗？" : "还没有工作信息，你要招人吗？"}
        </p>
        <button
          type="button"
          onClick={() => publish(seeking ? JOB_SEEKING_CATEGORY_SLUG : HIRING_CATEGORY_SLUG)}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          免费发布
        </button>
      </div>
    );
  }

  /** 帖子类标签都要先拿到分类 id 才能查；分类还没回来 / 查失败时的占位。 */
  function renderCategoriesGate() {
    if (categoriesError) {
      return (
        <p role="alert" className="px-4 py-6 text-sm text-text-muted">
          加载失败，请稍后重试。
        </p>
      );
    }
    return (
      <p role="status" className="sr-only">
        加载中…
      </p>
    );
  }

  function renderJobs() {
    const hiringId = categoryIdBySlug.get(HIRING_CATEGORY_SLUG);
    const seekingId = categoryIdBySlug.get(JOB_SEEKING_CATEGORY_SLUG);
    const jobCategoryIds = [hiringId, seekingId].filter((id): id is string => Boolean(id));
    const activeId = jobFilter === "all" ? undefined : categoryIdBySlug.get(jobFilter);

    let list;
    if (!categories) {
      list = renderCategoriesGate();
    } else if (jobFilter === "all" ? jobCategoryIds.length === 0 : !activeId) {
      // 分类还没建好（迁移没跑）时不能不带分类条件去查——那会把所有帖子都查出来。
      list = renderJobsEmptyState(jobFilter);
    } else {
      list = (
        <PostList
          key={`jobs-${jobFilter}`}
          variant="job"
          categoryId={activeId}
          categoryIds={jobFilter === "all" ? jobCategoryIds : undefined}
          stateCode={stateCode}
          emptyState={renderJobsEmptyState(jobFilter)}
        />
      );
    }

    return (
      <>
        <FilterChips label="招聘求职筛选" options={JOB_FILTERS} value={jobFilter} onChange={setJobFilter} />
        {list}
      </>
    );
  }

  function renderPostTab(slug: string, variant: "grid" | "wanted") {
    if (!categories) return renderCategoriesGate();
    const categoryId = categoryIdBySlug.get(slug);
    if (!categoryId) {
      return (
        <p role="status" className="px-4 py-6 text-sm text-text-muted">
          暂无帖子。
        </p>
      );
    }
    return (
      <PostList
        key={slug}
        variant={variant}
        categoryId={categoryId}
        stateCode={stateCode}
        onPublishClick={() => publish(slug)}
      />
    );
  }

  function renderContent() {
    switch (tab) {
      case "jobs":
        return renderJobs();
      case "housing":
        return (
          <>
            <FilterChips
              label="房屋租售筛选"
              options={HOUSING_FILTERS}
              value={housingFilter}
              onChange={setHousingFilter}
            />
            {renderPostTab(housingFilter, housingFilter === "wanted" ? "wanted" : "grid")}
          </>
        );
      case "used":
        return <div className="pt-2">{renderPostTab("used", "grid")}</div>;
      case "buddies":
        return (
          <div className="mx-auto max-w-2xl px-4">
            <ActivityFeed />
          </div>
        );
    }
  }

  return (
    <main data-testid="home-page">
      <TopBar
        variant="home"
        hideBrand
        regionLabel={selectedRegion ? formatShortRegionLabel(selectedRegion) : null}
        onRegionClick={() => navigate(REGION_SELECT_PATH)}
        onSearchClick={() => navigate(SEARCH_PATH)}
        bottomSlot={
          <div role="tablist" aria-label="首页分类" className="flex px-2">
            {HOME_TABS.map((item) => {
              const selected = item.key === tab;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(item.key)}
                  className={`relative flex flex-1 flex-col items-center gap-1 pb-2.5 pt-1.5 text-[13px] whitespace-nowrap ${
                    selected ? "font-semibold text-primary" : "text-text-muted"
                  }`}
                >
                  {/* 每个标签配一个线性图标（跟底部导航同一套 lucide 图标），
                      选中时图标和文字一起变蓝、线条加粗。 */}
                  <item.Icon aria-hidden="true" size={24} strokeWidth={selected ? 2.25 : 1.75} />
                  {item.label}
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-1/4 bottom-0 h-[3px] rounded-full bg-primary"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        }
      />

      <div role="tabpanel" aria-label={HOME_TABS.find((item) => item.key === tab)?.label} className="pb-24 md:pb-6">
        {renderContent()}
      </div>
    </main>
  );
}
