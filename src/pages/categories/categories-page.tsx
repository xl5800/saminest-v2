import { Link } from "react-router-dom";

import { useCategoriesQuery } from "../../features/categories/use-categories-query";

/**
 * "分类"标签页目标页面（/categories），公开可见，无需登录。跟 CategoryNav /
 * AppHeader 一样复用 useCategoriesQuery，不重新发一份分类查询。
 *
 * 加载中/失败态沿用 CategoryNav（role="status" / 静默）和 AdminCategoriesPage
 * （role="alert"）已有的约定，这里两种情况都展示明确的文案，不复用
 * CategoryNav 那种"失败时直接返回 null"的做法——那是导航栏组件刻意为之的
 * 静默降级，这里是一个独立页面，用户导航过来至少应该看到出错提示。
 */
export function CategoriesPage() {
  const { data: categories, isPending, isError } = useCategoriesQuery();

  if (isPending) {
    return (
      <main>
        <h1>分类</h1>
        <p role="status">加载中…</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main>
        <h1>分类</h1>
        <p role="alert">分类加载失败，请稍后重试。</p>
      </main>
    );
  }

  if (categories.length === 0) {
    return (
      <main>
        <h1>分类</h1>
        <p role="status">暂无分类。</p>
      </main>
    );
  }

  return (
    <main>
      <h1>分类</h1>
      <ul>
        {categories.map((category) => (
          <li key={category.id}>
            <Link to={`/category/${category.slug}`}>{category.nameZh}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
