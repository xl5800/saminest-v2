import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Query } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

import { QUERY_CACHE_MAX_AGE_MS } from "./query-client";

/**
 * 原生感 A 批：冷启动先显示上次的列表，后台再刷新（TanStack 官方的
 * persistQueryClient，存在手机本地的 localStorage）。
 *
 * 只存公开内容：分类信息帖子列表（"posts" 开头，包括首页二手、各分类页、
 * 附近 / 距离列表）、分类、社区列表、找搭子活动列表、地区。私信、通知、我的
 * 资料、收藏、后台这些都不存——别人拿到手机打开前就能看到聊天，或者退出登录后
 * 还留着上一个人的东西，都不行。
 *
 * - 保留 24 小时；超过就不用了，重新拉。
 * - App 版本号（VITE_APP_VERSION）变了就整份作废，避免数据格式改了以后读到
 *   旧格式；CACHE_SCHEMA_VERSION 是留给以后手动作废用的（改了查询返回的形状
 *   时加 1）。
 * - 被删 / 被封的帖子冷启动时可能会先闪一下旧列表，后台刷新回来就没了。
 */
const CACHE_SCHEMA_VERSION = "1";
const STORAGE_KEY = "saminest-query-cache";
const PERSISTED_QUERY_ROOTS = new Set(["posts", "categories", "communities", "activities", "activity-regions"]);

export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  const root = query.queryKey[0];
  return query.state.status === "success" && typeof root === "string" && PERSISTED_QUERY_ROOTS.has(root);
}

function getStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    // 隐私模式等拿不到 localStorage 时就不存，App 照常用。
    return undefined;
  }
}

export function createPersistOptions(): Omit<PersistQueryClientOptions, "queryClient"> {
  return {
    persister: createSyncStoragePersister({ storage: getStorage(), key: STORAGE_KEY }),
    maxAge: QUERY_CACHE_MAX_AGE_MS,
    buster: `${CACHE_SCHEMA_VERSION}-${import.meta.env.VITE_APP_VERSION ?? "web"}`,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery }
  };
}
