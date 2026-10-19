import { useState } from "react";

import { useDebouncedValue } from "./use-debounced-value";

/** 跟找搭子页、社区页的搜索一样，停止输入 400ms 后再查。 */
export const INLINE_SEARCH_DEBOUNCE_MS = 400;

export interface InlineSearch {
  isOpen: boolean;
  toggle: () => void;
  inputValue: string;
  setInputValue: (value: string) => void;
  /** 防抖、去掉首尾空格后的关键词；空字符串表示没有在搜。 */
  query: string;
}

/**
 * 分类页顶栏统一任务卡：顶栏搜索按钮"点一下展开搜索框、再点收起并清空"的
 * 状态。原来只有找搭子页（activity-list-page.tsx）有这段逻辑，现在招聘求职 /
 * 房屋租售 / 二手闲置 / 免费物品页也要，抽成一个 hook 共用。
 */
export function useInlineSearch(): InlineSearch {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const query = useDebouncedValue(inputValue, INLINE_SEARCH_DEBOUNCE_MS).trim();

  function toggle(): void {
    setIsOpen((current) => {
      if (current) setInputValue("");
      return !current;
    });
  }

  return { isOpen, toggle, inputValue, setInputValue, query };
}
