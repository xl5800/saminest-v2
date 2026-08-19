import { Link } from "react-router-dom";

import { useCategoriesQuery } from "./use-categories-query";

export interface CategoryNavProps {
  activeSlug?: string;
}

export function CategoryNav({ activeSlug }: CategoryNavProps) {
  const { data: categories, isPending, isError } = useCategoriesQuery();

  if (isPending) {
    return (
      <nav aria-label="分类导航" className="flex gap-2 overflow-x-auto px-4 py-2">
        <p role="status" className="whitespace-nowrap text-sm text-text-muted">
          分类加载中…
        </p>
      </nav>
    );
  }

  if (isError || !categories) {
    return null;
  }

  // 未选中态改成白底（bg-card）而不是页面画布色（bg-bg）——Meet5 风格
  // 改版之后 --color-bg 是一个带蓝色调的浅灰画布，不再接近纯白，chips 需要
  // 用真正的白色才能在画布上"浮"出来，见 02-home-page.md"筛选 Chips：
  // ……未选中态白底灰字"。边框保留（设计稿的静态截图里没有画出来，但
  // --color-border 现在的值已经很浅——#ececef，白底 chip 完全不描边在
  // #f3f5fa 画布上对比度太低，这是比照设计稿做的一个小取舍，不是照抄）。
  const inactiveClassName =
    "flex h-11 items-center justify-center rounded-full border border-border bg-card px-4 text-sm whitespace-nowrap text-text-muted";
  const activeClassName =
    "flex h-11 items-center justify-center rounded-full px-4 text-sm whitespace-nowrap bg-accent text-white font-semibold";

  return (
    <nav aria-label="分类导航" className="flex gap-2 overflow-x-auto px-4 py-2">
      <Link
        to="/"
        aria-current={activeSlug ? undefined : "page"}
        className={activeSlug ? inactiveClassName : activeClassName}
      >
        推荐
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          to={`/category/${category.slug}`}
          aria-current={activeSlug === category.slug ? "page" : undefined}
          className={activeSlug === category.slug ? activeClassName : inactiveClassName}
        >
          {category.nameZh}
        </Link>
      ))}
    </nav>
  );
}
