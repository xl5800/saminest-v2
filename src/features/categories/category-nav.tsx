import { Link } from "react-router-dom";

import { useCategoriesQuery } from "./use-categories-query";

export interface CategoryNavProps {
  activeSlug?: string;
}

export function CategoryNav({ activeSlug }: CategoryNavProps) {
  const { data: categories, isPending, isError } = useCategoriesQuery();

  if (isPending) {
    return (
      <nav aria-label="分类导航">
        <p role="status">分类加载中…</p>
      </nav>
    );
  }

  if (isError || !categories) {
    return null;
  }

  return (
    <nav aria-label="分类导航">
      <Link to="/" aria-current={activeSlug ? undefined : "page"}>
        全部
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          to={`/category/${category.slug}`}
          aria-current={activeSlug === category.slug ? "page" : undefined}
        >
          {category.nameZh}
        </Link>
      ))}
    </nav>
  );
}
