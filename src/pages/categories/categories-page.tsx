import { Link } from "react-router-dom";

import { TopBar } from "../../components/top-bar";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";

/**
 * "分类"标签页目标页面（/categories），公开可见，无需登录。跟 CategoryNav /
 * AppHeader 一样复用 useCategoriesQuery，不重新发一份分类查询。
 *
 * 加载中/失败态沿用 CategoryNav（role="status" / 静默）和 AdminCategoriesPage
 * （role="alert"）已有的约定，这里两种情况都展示明确的文案，不复用
 * CategoryNav 那种"失败时直接返回 null"的做法——那是导航栏组件刻意为之的
 * 静默降级，这里是一个独立页面，用户导航过来至少应该看到出错提示。
 *
 * Meet5 风格改版（03-category-tab.md）：
 * - 顶部栏换成 TopBar 的 tab 变体，居中标题"分类"，左右都不放图标（无
 *   品牌、无发布、无"?"帮助图标）——组件本身已经是这个页面的 <h1>，删掉了
 *   原来自己手写的 <h1>，避免同一个页面出现两个 <h1>。这个路由需要加进
 *   app-shell.tsx 的 TOPBAR_MIGRATED_PATTERNS（关掉全局 AppHeader，保留
 *   BottomNav——分类 Tab 页仍然是"能在 5 个 Tab 间跳转"的常规浏览场景，
 *   不是沉浸式页面）。
 * - tile 从"边框+左对齐文字"换成"白底圆角16px、纯文字居中"，去掉了描边——
 *   参照设计稿"白底圆角16px卡片，纯文字居中，无图标也可"，这里选择不加
 *   图标（任务卡原话"无图标也可"，加图标需要额外决定每个分类配哪个中性
 *   线性图标，属于任务卡本身没有强制要求的额外设计决策，不在这次改动里
 *   顺带做）。
 * - 点击 tile 不再跳去独立的 /category/:slug 详情页——那个页面已经跟着
 *   这次改动一起退役，统一改成跳转到首页并带上 ?category=<slug> 查询
 *   参数，首页自己读这个参数筛选（复用 02 号卡已经建好的 PostList，不用
 *   再做一套列表 UI，见 home-page.tsx 的改动）。
 */
export function CategoriesPage() {
  const { data: categories, isPending, isError } = useCategoriesQuery();

  if (isPending) {
    return (
      <main>
        <TopBar variant="tab" title="分类" />
        <p role="status" className="px-4 py-6 text-sm text-text-muted">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <TopBar variant="tab" title="分类" />
        <p
          role="alert"
          className="mx-4 mt-4 rounded border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          分类加载失败，请稍后重试。
        </p>
      </main>
    );
  }

  if (categories.length === 0) {
    return (
      <main>
        <TopBar variant="tab" title="分类" />
        <p role="status" className="px-4 py-6 text-sm text-text-muted">暂无分类。</p>
      </main>
    );
  }

  return (
    <main>
      <TopBar variant="tab" title="分类" />
      <ul className="mx-auto grid max-w-2xl grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              to={`/?category=${category.slug}`}
              className="block rounded-2xl bg-card py-6 text-center text-base font-semibold text-text hover:text-primary"
            >
              {category.nameZh}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
