import { CategoryNav } from "../../features/categories/category-nav";
import { PostList } from "../../features/posts/post-list";

export function HomePage() {
  return (
    <main>
      <h1>Saminest</h1>
      <div className="px-4 pt-2">
        <input
          type="search"
          placeholder="搜租房、求租、二手物品…"
          className="w-full rounded-full border border-border bg-bg px-4 py-2 text-sm text-text shadow-sm"
        />
      </div>
      <CategoryNav />
      <PostList key="all" />
    </main>
  );
}
