/**
 * 社区圆角方形头像里显示的缩写。原来直接用 slug.toUpperCase()（"DMV"），多社区之后
 * slug 变成 dmv-pets / dmv-students，整串大写会超出 48~52px 的方形头像；取 slug 按
 * "-" 切开的第一段并限制长度，三个 DMV 社区头像都是"DMV"，靠旁边的社区名区分。
 */
const MAX_ABBREVIATION_LENGTH = 4;

export function getCommunityAbbreviation(slug: string): string {
  const firstSegment = slug.split("-")[0] ?? slug;
  return firstSegment.slice(0, MAX_ABBREVIATION_LENGTH).toUpperCase();
}
