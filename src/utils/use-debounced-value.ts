import { useEffect, useState } from "react";

/**
 * 通用的防抖值 hook：返回 value 的一个"延迟版本"，只有在 value 停止变化
 * delayMs 毫秒之后才更新，期间每次 value 变化都会重新起一个新的计时器、
 * 取消上一个（标准的 useState + useEffect + setTimeout 防抖实现）。
 *
 * 这是首页/分类页搜索框用的：真实搜索请求跟着这个防抖值走，避免用户每敲
 * 一个字就打一次数据库；输入框本身仍然绑定未防抖的即时值，让打字手感
 * 不受影响。
 *
 * admin 后台（如 src/pages/admin/users-page.tsx）的搜索用的是"输入 + 点击
 * 提交按钮"模式，不是这种防抖实时搜索——那是刻意的、跟这里不同的选择：
 * admin 后台是给管理员用的精确查找工具，管理员心里清楚自己要搜什么、
 * 输入完整关键词后主动点一下更符合"精确操作"的预期；这里则是面向普通
 * 用户的"边逛边筛"浏览场景，本身就是实时过滤（分类 pill 一点就生效，
 * 不需要额外点确认），搜索框要求用户额外点提交/回车反而跟同一个页面里
 * 其它筛选控件的交互模型不一致。两边不共用同一套交互逻辑是有意为之，
 * 不是漏掉了复用。
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
