import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { FilterChips } from "../../components/filter-chips";
import { TopBar } from "../../components/top-bar";
import { HIRING_CATEGORY_SLUG, JOB_SEEKING_CATEGORY_SLUG } from "../../features/posts/job-fields";
import { PostList } from "../../features/posts/post-list";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { CategoriesGate } from "../../features/categories/categories-gate";

type JobFilter = "all" | typeof HIRING_CATEGORY_SLUG | typeof JOB_SEEKING_CATEGORY_SLUG;

const JOB_FILTERS: Array<{ key: JobFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: HIRING_CATEGORY_SLUG, label: "招聘" },
  { key: JOB_SEEKING_CATEGORY_SLUG, label: "求职" }
];

/**
 * 招聘求职页（/jobs，公开）——首页图标入口改版：原来是首页的第一个标签，
 * 现在首页只放图标，点"招聘求职"进到这里。内容跟原来的标签一样：全部 /
 * 招聘 / 求职三个筛选，PostList 的 job 文字行，按当前选中的州筛选；没有
 * 内容时引导"免费发布"。右上角"＋"直接发招聘（求职筛选下发求职）。
 */
export function JobsPage() {
  const navigate = useNavigate();
  const stateCode = useSelectedRegionStore((s) => s.selectedRegion?.stateCode);
  const [filter, setFilter] = useState<JobFilter>("all");
  const publishSlug = filter === JOB_SEEKING_CATEGORY_SLUG ? JOB_SEEKING_CATEGORY_SLUG : HIRING_CATEGORY_SLUG;

  function renderEmptyState() {
    const seeking = filter === JOB_SEEKING_CATEGORY_SLUG;
    return (
      <div role="status" className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-base text-text-body">
          {seeking ? "还没有求职信息，你在找工作吗？" : "还没有工作信息，你要招人吗？"}
        </p>
        <button
          type="button"
          onClick={() => navigate(`/publish?category=${publishSlug}`)}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          免费发布
        </button>
      </div>
    );
  }

  return (
    <main data-testid="jobs-page" className="pb-24 md:pb-6">
      <TopBar
        variant="nav-only"
        title="招聘求职"
        right={{
          icon: <Plus size={20} aria-hidden="true" />,
          label: "发布",
          onClick: () => navigate(`/publish?category=${publishSlug}`)
        }}
      />
      <FilterChips label="招聘求职筛选" options={JOB_FILTERS} value={filter} onChange={setFilter} />
      <CategoriesGate>
        {(idBySlug) => {
          const hiringId = idBySlug.get(HIRING_CATEGORY_SLUG);
          const seekingId = idBySlug.get(JOB_SEEKING_CATEGORY_SLUG);
          const allIds = [hiringId, seekingId].filter((id): id is string => Boolean(id));
          const activeId = filter === "all" ? undefined : idBySlug.get(filter);
          // 分类还没建好（迁移没跑）时不能不带分类条件去查——那会把所有帖子都查出来。
          if (filter === "all" ? allIds.length === 0 : !activeId) {
            return renderEmptyState();
          }
          return (
            <PostList
              key={filter}
              variant="job"
              categoryId={activeId}
              categoryIds={filter === "all" ? allIds : undefined}
              stateCode={stateCode}
              emptyState={renderEmptyState()}
            />
          );
        }}
      </CategoriesGate>
    </main>
  );
}
