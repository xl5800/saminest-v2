export interface PostImageSortOrderSource {
  sortOrder: number;
}

/**
 * 新上传的一批图片，第一张该从哪个 sort_order 开始。
 *
 * 不能用"当前还显示着几张图"（existingImages.length）去推算——那是
 * 数量，不是这一列实际用到过的最大值。post_images 表的
 * post_images_post_id_sort_order_active_key 是局部唯一索引，只挡
 * `deleted_at is null` 的活跃行（见
 * supabase/migrations/20260723000100_fix_post_images_sort_order_unique_excludes_deleted.sql）：
 * 软删除一张图之后，显示的数量少了一个，但没被删的那些行仍然占着它们
 * 原来的 sort_order。如果新图又从"还剩几张"重新数起，很容易撞上这些
 * 还活着的行，导致这一批 insert 整体失败（Storage 那边已经传完了，
 * 数据库这一步却失败，留下孤儿文件）。
 *
 * 正确算法：没有活跃图片时从 0 开始；否则取当前活跃图片里最大的
 * sort_order 再加 1。新建帖子（永远传空数组）、编辑帖子（传当前还在
 * 显示的活跃图片）用的是同一个函数，不是两套逻辑。
 */
export function getNextPostImageSortOrder(
  activeImages: readonly PostImageSortOrderSource[]
): number {
  if (activeImages.length === 0) {
    return 0;
  }
  return Math.max(...activeImages.map((image) => image.sortOrder)) + 1;
}
