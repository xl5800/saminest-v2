import { useParams } from "react-router-dom";

import { CategoryNav } from "../../features/categories/category-nav";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import { PostList } from "../../features/posts/post-list";

export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: categories, isPending, isError } = useCategoriesQuery();

  if (isPending) {
    return (
      <main>
        <p role="status">加载中…</p>
      </main>
    );
  }

  const category = categories?.find((item) => item.slug === slug);

  if (isError || !category) {
    return (
      <main>
        <h1>分类未找到</h1>
        <p role="alert">没有找到这个分类。</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{category.nameZh}</h1>
      <CategoryNav activeSlug={slug} />
      <PostList key={category.id} categoryId={category.id} />
    </main>
  );
}
