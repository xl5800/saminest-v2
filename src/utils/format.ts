export function formatPrice(
  priceAmount: number | null,
  priceLabel: string | null,
  currencyCode: string
): string {
  if (priceLabel) return priceLabel;
  if (priceAmount === null) return "价格未填写";
  return `${currencyCode} ${priceAmount.toLocaleString("zh-CN")}`;
}

/**
 * 首页/分类页信息流卡片（post-list.tsx）用："价格未填写"这个占位文案要用
 * 灰色弱化展示，跟真实价格的黑色加粗区分开——判断条件必须跟 formatPrice
 * 走到"价格未填写"分支的条件逐字一致（没有 priceLabel 且 priceAmount 为
 * null），单独抽成这个函数导出，调用方不需要自己在页面里重新拼一遍同样
 * 的判断，也不会因为两处条件各写一遍而以后改出不一致。
 */
export function isPriceUnset(priceAmount: number | null, priceLabel: string | null): boolean {
  return !priceLabel && priceAmount === null;
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
/**
 * "一起去"活动的开始时间：日期+时间（比如 "08-05 14:00"），用本地时区，
 * 不是 formatListingDate 那种只显示日历日期、故意用 UTC 的做法——那是为了
 * 避免"帖子发布日期"这种只关心"哪一天"的场景在时区边界上显示错日期；
 * 活动开始时间用户关心的是具体几点几分要到场，这跟 formatMessageTimeDivider
 * 展示消息时间用本地时区是同一个道理，不是 formatListingDate 那种场景。
 */
export function formatActivityStartAt(startAt: string): string {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "时间未知";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

/**
 * "还差几人/已有几人"这行文案。capacity 为 null 表示不限人数，只展示
 * 已报名人数；capacity 有值时优先展示"还差几人"（更能驱动用户报名的
 * 紧迫感），凑满/超过人数上限（理论上不应该发生，触发器会在满员时把
 * status 切成 'full' 挡住新报名，但界面上仍然防御性地用 Math.max 兜底，
 * 不展示负数）时改成"已满员"。
 */
export function formatActivityParticipantSummary(
  participantCount: number,
  capacity: number | null
): string {
  if (capacity === null) {
    return `已有 ${participantCount} 人报名`;
  }

  const remaining = Math.max(capacity - participantCount, 0);
  return remaining > 0
    ? `还差 ${remaining} 人（${participantCount}/${capacity}）`
    : `已满员（${participantCount}/${capacity}）`;
}

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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_TIME_MAX_DAYS = 30;

/**
 * "X 前"这类相对时间文案——23 号卡新增，帖子详情页的发帖者卡片用（见
 * post-detail-page.tsx，文案是"发布于 {formatRelativeTimeAgo(createdAt)}"）。
 *
 * 23 号卡本来想展示"活跃于 X 前"（用户最后活跃时间），调查后发现
 * profiles.last_active_at 这一列虽然在表定义里（见
 * 20260715220000_create_profiles_table.sql），但全仓库没有任何触发器/RPC/
 * 前端代码会写入它——不是"没有这个数据"那么简单，是"这一列的值对所有用户
 * 永远是 null，因为压根没有代码路径会更新它"，等同于没有这个数据。按 23
 * 号卡的指示，没有为了展示这一个字段新增触发器/迁移去维护它，退回展示
 * 帖子自己的发布时间（posts.created_at，详情页原本就在查的字段）。
 *
 * 超过 30 天之后退化成 formatListingDate 那种绝对日期——"发布于 128 天前"
 * 这种大数字对用户没有实际意义，绝对日期反而更好读，跟 formatListingDate
 * 已有的"当年只显示月-日，跨年显示完整年份"规则保持一致，不重新发明一套
 * 日期格式。
 */
export function formatRelativeTimeAgo(dateString: string | null, now: Date = new Date()): string {
  if (!dateString?.trim()) return "时间未知";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "时间未知";

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < MINUTE_MS) return "刚刚";
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)} 分钟前`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)} 小时前`;

  const days = Math.floor(diffMs / DAY_MS);
  if (days < RELATIVE_TIME_MAX_DAYS) return `${days} 天前`;

  return formatListingDate(dateString);
}
