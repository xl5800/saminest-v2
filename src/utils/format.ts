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

const MESSAGE_TIME_DIVIDER_GAP_MS = 5 * 60 * 1000;

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 会话消息是否需要在气泡上方插入独立的时间分隔线（参考微信/小红书的分组
 * 时间线）：第一条消息、跨天，或距离上一条消息超过 5 分钟。
 */
export function shouldShowMessageTimeDivider(
  createdAt: string,
  previousCreatedAt: string | null
): boolean {
  if (!previousCreatedAt) return true;

  const current = new Date(createdAt);
  const previous = new Date(previousCreatedAt);
  if (Number.isNaN(current.getTime()) || Number.isNaN(previous.getTime())) return true;

  if (!isSameLocalDay(current, previous)) return true;

  return Math.abs(current.getTime() - previous.getTime()) > MESSAGE_TIME_DIVIDER_GAP_MS;
}

/**
 * 时间分隔线文案：今天只显示时:分，昨天加"昨天"前缀，更早显示完整日期。
 * 使用本地时区，与用户对"今天/昨天"的直觉一致。
 */
export function formatMessageTimeDivider(createdAt: string, now: Date = new Date()): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";

  const timeLabel = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (isSameLocalDay(date, now)) return timeLabel;

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) return `昨天 ${timeLabel}`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day} ${timeLabel}`;
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
