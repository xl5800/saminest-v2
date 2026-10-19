/** 发布页 URL 上限定可选分类的参数名（`?only=rent,wanted`）。 */
export const PUBLISH_ONLY_PARAM = "only";

/**
 * 分类页顶栏统一任务卡：分类页的"＋"只发当前分类。`category` 是预先选中的
 * 分类，`onlySlugs` 是发布页上允许出现的分类（房屋租售页是出租 + 求租，
 * 二手闲置页只有二手）。底部导航的"＋"不走这里，发布页照样显示全部分类。
 */
export function buildPublishPath(category: string, onlySlugs: string[]): string {
  // 分类 slug 只有小写字母和连字符，不需要转义；逗号保持原样，URL 好读一些。
  return `/publish?category=${category}&${PUBLISH_ONLY_PARAM}=${onlySlugs.join(",")}`;
}
