import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { PublishActionSheet } from "./publish-action-sheet";

/**
 * 全局持久顶部导航栏，由 AppShell 包在每一个路由外层渲染。
 *
 * 分类链接不在这里渲染：AppHeader 是每个路由外层都有的全局 chrome
 * （帖子详情页、发布页、后台管理页……），"当前处于哪个分类"这个概念在
 * 这些页面上并不成立。分类浏览天生是页面级的（首页 / 分类页 feed），
 * 已经由 HomePage 和 CategoryPage 共用的 CategoryNav 组件承担，这里不
 * 重复渲染第二套分类链接。
 *
 * "发布"不再是直接跳 /publish 的链接：点击打开 PublishActionSheet 选发布
 * 类型（租房/求租/二手/发起搭子），这是全 App 唯一的发布入口——之前
 * BottomNav 中间还有一个圆形"发布"按钮，这次跟着底部导航改成 5 个平级
 * 目的地一起去掉了，避免同一个操作在 App 里出现两个入口。
 */
export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [publishSheetOpen, setPublishSheetOpen] = useState(false);

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

        <button
          type="button"
          onClick={() => setPublishSheetOpen(true)}
          className="ml-auto shrink-0 rounded-xl bg-accent px-4 py-2 font-semibold text-white"
        >
          发布
        </button>

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

      {publishSheetOpen ? (
        <PublishActionSheet onClose={() => setPublishSheetOpen(false)} />
      ) : null}
    </header>
  );
}
