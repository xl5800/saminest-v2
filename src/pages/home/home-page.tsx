import { useState } from "react";

import { CategoryNav } from "../../features/categories/category-nav";
import { PostList } from "../../features/posts/post-list";
import { useDebouncedValue } from "../../utils/use-debounced-value";

const SEARCH_DEBOUNCE_MS = 400;

/**
 * 搜索交互模型：防抖实时搜索，不是"输入完点提交/回车"。
 *
 * 这个搜索框就在这个"边逛边筛"的浏览页最上面，紧挨着下面的分类 pill——
 * 那些 pill 点一下就直接过滤，没有单独的"应用"步骤，搜索框如果反而要求
 * 多一步提交操作，会跟同一屏内其它筛选控件的交互模型不一致。防抖只是为了
 * 不在用户每敲一个字的时候都打一次数据库，不需要用户自己多做任何操作
 * 来换取这个效果。
 *
 * 输入框本身绑定未防抖的 inputValue（打字手感即时），实际传给 PostList
 * 触发查询的是防抖之后的 debouncedSearchQuery。
 */
export function HomePage() {
  const [inputValue, setInputValue] = useState("");
  const debouncedSearchQuery = useDebouncedValue(inputValue, SEARCH_DEBOUNCE_MS);

  return (
    <main>
      <h1>Saminest</h1>
      <div className="px-4 pt-2">
        <input
          type="search"
          placeholder="搜租房、求租、二手物品…"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          className="h-13 w-full rounded-search border border-border bg-bg px-4 text-base text-text shadow-search"
        />
      </div>
      <CategoryNav />
      <PostList key="all" searchQuery={debouncedSearchQuery} />
    </main>
  );
}
