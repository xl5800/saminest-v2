export function formatPrice(
  priceAmount: number | null,
  priceLabel: string | null,
  currencyCode: string
): string {
  if (priceLabel) return priceLabel;
  if (priceAmount === null) return "价格未填写";
  return `${currencyCode} ${priceAmount.toLocaleString("zh-CN")}`;
}

export function formatPublishedAt(publishedAt: string | null): string {
  if (!publishedAt) return "发布时间未知";
  return new Date(publishedAt).toLocaleDateString("zh-CN");
}

/**
 * 帖子列表和详情统一使用数据库 created_at 的 UTC 日历日期。
 *
 * Supabase 返回的 timestamptz 是带时区的 ISO 字符串。这里明确读取 UTC
 * 年/月/日，而不是运行设备的本地时区，避免 UTC 午夜附近的时间在美东等
 * 时区被显示成前一天。当前年份也按 UTC 判断，保证规则前后一致。
 */
export function formatListingDate(createdAt: string | null): string {
  if (!createdAt?.trim()) return "时间未知";

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "时间未知";

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const currentYear = new Date().getUTCFullYear();

  return year === currentYear ? `${month}-${day}` : `${year}-${month}-${day}`;
}
