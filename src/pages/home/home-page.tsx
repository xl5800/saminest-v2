import { CategoryNav } from "../../features/categories/category-nav";
import { PostList } from "../../features/posts/post-list";

export function HomePage() {
  return (
    <main>
      <h1>Saminest</h1>
      <CategoryNav />
      <PostList key="all" />
    </main>
  );
}
