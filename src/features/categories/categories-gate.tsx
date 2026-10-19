import type { ReactNode } from "react";

import { useCategoriesQuery } from "./use-categories-query";

/**
 * 招聘求职 / 房屋租售 / 二手闲置 / 免费物品列表共用：帖子列表要先知道分类 id
 * 才能查，分类还没查回来时显示占位，查失败显示错误；查到后把
 * "slug → id" 的对照表交给 children。
 */
export function CategoriesGate({
  children
}: {
  children: (categoryIdBySlug: Map<string, string>) => ReactNode;
}) {
  const { data: categories, isError } = useCategoriesQuery();

  if (isError) {
    return (
      <p role="alert" className="px-4 py-6 text-sm text-text-muted">
        加载失败，请稍后重试。
      </p>
    );
  }
  if (!categories) {
    return (
      <p role="status" className="sr-only">
        加载中…
      </p>
    );
  }
  return <>{children(new Map(categories.map((category) => [category.slug, category.id])))}</>;
}

export function NoPostsYet() {
  return (
    <p role="status" className="px-4 py-6 text-sm text-text-muted">
      暂无帖子。
    </p>
  );
}
