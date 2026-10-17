import { useEffect } from "react";

import { type ContentType, track } from "./track";

/**
 * 数据分析任务卡：详情页内容加载出来以后记一次 content_viewed。同一个页面
 * 换成另一条内容（id 变了）会再记一次；内容还没加载出来或加载失败不记。
 */
export function useTrackContentView(type: ContentType, id: string | undefined, loaded: boolean): void {
  useEffect(() => {
    if (id && loaded) track("content_viewed", { type });
  }, [type, id, loaded]);
}
