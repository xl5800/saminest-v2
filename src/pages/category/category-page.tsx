import { useState } from "react";
import { useParams } from "react-router-dom";

import { CategoryNav } from "../../features/categories/category-nav";
import { useCategoriesQuery } from "../../features/categories/use-categories-query";
import { PostList } from "../../features/posts/post-list";
import { useDebouncedValue } from "../../utils/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 400;

interface CategoryPostsProps {
  categoryId: string;
  slug: string | undefined;
}

/**
 * 分类页的搜索框 + 分类导航 + 帖子列表打包成一个组件，靠 CategoryPage 那边
 * 传下来的 key={category.id}（见下方 CategoryPage）整体重新挂载来复位
 * 状态——不只是 PostList 原本就有的分页状态，现在也包括这个组件自己持有
 * 的搜索框输入值/防抖值：从 /category/rent 切到 /category/wanted 不应该
 * 带着上一个分类的搜索词过去。
 *
 * 搜索交互模型（防抖实时搜索，不要求单独提交）跟首页 HomePage 是同一套
 * 选择，原因也一样：CategoryNav 那一排分类 pill 点一下就直接生效，搜索框
 * 如果要求额外一步提交，会跟同一屏内其它筛选控件不一致。
 */
function CategoryPosts({ categoryId, slug }: CategoryPostsProps) {
  const [inputValue, setInputValue] = useState("");
  const debouncedSearchQuery = useDebouncedValue(inputValue, SEARCH_DEBOUNCE_MS);

  return (
    <>
      <div className="px-4 pt-2">
        <input
          type="search"
          placeholder="搜索本分类下的帖子…"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          className="h-13 w-full rounded-search border border-border bg-bg px-4 text-base text-text shadow-search"
        />
      </div>
      <CategoryNav activeSlug={slug} />
      <PostList categoryId={categoryId} searchQuery={debouncedSearchQuery} />
    </>
  );
}

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
      <CategoryPosts key={category.id} categoryId={category.id} slug={slug} />
    </main>
  );
}
