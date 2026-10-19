/**
 * 首页"附近的二手"任务卡：卡片上的距离文字。不到 1 英里写"1 英里内"，
 * 100 英里以内保留一位小数（"约 2.3 英里"），更远的取整（"约 203 英里"）。
 * 距离是到帖子邮编中心点的直线距离，所以都写"约"。
 */
export function formatDistanceMiles(miles: number): string {
  if (miles < 1) return "1 英里内";
  if (miles < 100) return `约 ${miles.toFixed(1)} 英里`;
  return `约 ${Math.round(miles)} 英里`;
}
