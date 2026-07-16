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
