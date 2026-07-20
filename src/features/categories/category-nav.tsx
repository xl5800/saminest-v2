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

  const inactiveClassName =
    "rounded-full border border-border bg-bg px-4 py-1.5 text-sm whitespace-nowrap text-text-muted";
  const activeClassName =
    "rounded-full px-4 py-1.5 text-sm whitespace-nowrap bg-accent text-white font-semibold";

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
