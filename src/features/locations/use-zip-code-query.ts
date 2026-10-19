import { useQuery } from "@tanstack/react-query";

import { lookupZipCode, ZIP_CODE_PATTERN } from "../../repositories/zip-codes-repository";

/**
 * 发布页 ZIP 定位任务卡：输入满 5 位数字才查；邮编和城市的对应关系几乎
 * 不变，查过的邮编在这次会话里一直缓存。
 */
export function useZipCodeQuery(zip: string) {
  return useQuery({
    queryKey: ["zip-code", zip],
    queryFn: () => lookupZipCode(zip),
    enabled: ZIP_CODE_PATTERN.test(zip),
    staleTime: Infinity
  });
}
