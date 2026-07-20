import { Link, useLocation, useNavigate } from "react-router-dom";

import { useCategoriesQuery } from "../features/categories/use-categories-query";

/**
 * 全局持久顶部导航栏，由 AppShell 包在每一个路由外层渲染。
 *
 * 分类链接复用 CategoryNav 已经在用的 useCategoriesQuery 这个数据获取
 * hook，不重新发一份分类查询——分类数据来自数据库，不能在这里硬编码
 * "租房/求租/二手"这几个具体分类，否则分类表以后变化时这里就会跟真实数据
 * 脱节。不直接复用 <CategoryNav /> 组件本身，是因为这里的展示需求
 * （"首页"文案、没有 activeSlug 高亮）跟 CategoryNav（"全部"文案 +
 * aria-current 高亮）不完全一致，复用它的 hook 已经满足了"不重复发请求"
 * 这个核心诉求。
 */
export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: categories } = useCategoriesQuery();

  const showBackButton = location.pathname !== "/";

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg">
      <div className="flex items-center gap-4 px-4 py-3">
        {showBackButton ? (
          <button
            type="button"
            aria-label="返回"
            onClick={() => navigate(-1)}
            className="shrink-0 text-lg text-text"
          >
            ←
          </button>
        ) : null}

        <Link to="/" className="shrink-0 text-lg font-bold text-primary">
          Saminest
        </Link>

        <nav aria-label="分类导航" className="hidden items-center gap-4 md:flex">
          <Link to="/" className="text-text hover:text-primary">
            首页
          </Link>
          {(categories ?? []).map((category) => (
            <Link
              key={category.id}
              to={`/category/${category.slug}`}
              className="text-text hover:text-primary"
            >
              {category.nameZh}
            </Link>
          ))}
        </nav>

        <Link
          to="/publish"
          className="ml-auto shrink-0 rounded bg-accent px-4 py-2 font-semibold text-text"
        >
          发布
        </Link>

        <nav aria-label="用户导航" className="hidden items-center gap-4 md:flex">
          <Link to="/favorites" className="text-text hover:text-primary">
            收藏
          </Link>
          <Link to="/messages" className="text-text hover:text-primary">
            消息
          </Link>
          <Link to="/profile" className="text-text hover:text-primary">
            我的
          </Link>
        </nav>
      </div>
    </header>
  );
}
