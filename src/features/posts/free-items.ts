/**
 * 免费物品任务卡：免费物品是 posts 表里的一个分类（slug = free，见
 * supabase/migrations/20261019060000_add_free_items_and_activity_zip.sql），
 * 不另建表。发帖时不填价格，price_label 写"免费"——列表 / 详情现有的
 * formatPrice 会直接显示这两个字。
 */
export const FREE_CATEGORY_SLUG = "free";
export const FREE_PRICE_LABEL = "免费";
