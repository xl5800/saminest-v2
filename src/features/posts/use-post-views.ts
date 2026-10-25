import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { getPostViewCount, recordPostView } from "../../repositories/posts-repository";

const VIEWED_STORAGE_PREFIX = "saminest-post-viewed:";

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * 详情页打开时记一次浏览。同一台手机同一篇帖子一天只记一次（存在 localStorage，
 * 读写失败就照记，不影响看帖子）；作者自己看不记（enabled 传 false，数据库那边
 * 也会再挡一次）。
 */
export function useRecordPostView(postId: string | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!postId || !enabled) return;
    const storageKey = `${VIEWED_STORAGE_PREFIX}${postId}`;
    const today = todayKey();
    try {
      if (window.localStorage.getItem(storageKey) === today) return;
      window.localStorage.setItem(storageKey, today);
    } catch {
      // 隐私模式等拿不到 localStorage 时照记一次。
    }
    void recordPostView(postId);
  }, [postId, enabled]);
}

/** 浏览次数，只给作者本人和管理员查（enabled 由调用方判断）。 */
export function usePostViewCountQuery(postId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["post-view-count", postId],
    queryFn: () => getPostViewCount(postId as string),
    enabled: Boolean(postId) && enabled
  });
}
