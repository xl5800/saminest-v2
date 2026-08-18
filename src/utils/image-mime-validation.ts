/**
 * 图片选择组件共用的 MIME 类型校验——post-image-picker.tsx（发布表单）和
 * avatar-picker.tsx（头像）都只接受 JPEG/PNG/WEBP，遇到不支持的类型时
 * 又都要给 HEIC 这个最常见的"撞坑"场景一句能自己动手解决的具体提示，两边
 * 逐字重复这段逻辑容易在以后改动时只改一边、漏改另一边（比如以后要加
 * AVIF 支持）。抽成这一个两边共用的纯函数模块，不在两个组件文件里各自
 * private 一份。
 *
 * 只抽 MIME 类型判断这一小段，不是把整个校验规则（数量上限、大小上限、
 * 批次内去重）都搬过来——那些规则 post-image-picker.tsx 和 avatar-picker.tsx
 * 并不共用（头像只选一张、没有"批次内去重"的概念，大小上限两边目前数值
 * 也不保证永远一致），勉强抽成一个通用规则集反而会让两边都得传一堆参数
 * 覆盖对方不需要的选项，得不偿失。
 */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

// iPhone 相机默认就拍 HEIC，这是用户真实会撞上的最常见"不支持格式"场景，
// 给一句能让用户自己动手解决的具体提示，比笼统的"只支持 JPEG/PNG/WEBP"
// 更有用——不确定 file.type 本身是不是 100% 可靠地报告成这两个字符串
// （不同浏览器/系统对 HEIC 的 MIME 类型上报本来就不完全一致），但这里
// 只处理这两个已确认的字面值，不为了覆盖更多不确定的情况去猜测别的
// 检测方式。
const HEIC_MIME_TYPES = ["image/heic", "image/heif"];

type AcceptedImageMimeType = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

export function isAcceptedImageMimeType(type: string): type is AcceptedImageMimeType {
  return (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * 给一个 MIME 类型不被接受的文件生成提示文案——调用方负责先用
 * isAcceptedImageMimeType 判断确实不通过，这个函数不重复做那个判断。
 */
export function describeUnsupportedImageMimeType(file: File): string {
  if (HEIC_MIME_TYPES.includes(file.type)) {
    return `${file.name}：iPhone 拍摄的 HEIC 格式暂不支持，请在系统设置里把拍照格式改成"兼容性最好"（设置 → 相机 → 格式），或从相册选择时选择 JPEG 格式后再试。`;
  }
  return `${file.name}：只支持 JPEG、PNG 或 WEBP 格式的图片。`;
}
