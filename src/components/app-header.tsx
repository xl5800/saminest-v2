import { Link, useLocation, useNavigate } from "react-router-dom";

/**
 * 全局持久顶部导航栏，由 AppShell 包在每一个路由外层渲染。
 *
 * 分类链接不在这里渲染：AppHeader 是每个路由外层都有的全局 chrome
 * （帖子详情页、发布页、后台管理页……），"当前处于哪个分类"这个概念在
 * 这些页面上并不成立。分类浏览天生是页面级的（首页 / 分类页 feed），
 * 已经由 HomePage 和 CategoryPage 共用的 CategoryNav 组件承担，这里不
 * 重复渲染第二套分类链接。
 */
export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  const showBackButton = location.pathname !== "/";

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg">
      <div className="flex h-14 items-center gap-4 px-4">
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

        <Link
          to="/publish"
          className="ml-auto shrink-0 rounded-xl bg-accent px-4 py-2 font-semibold text-white"
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
