/**
 * 上传前压缩：把选好的图片等比缩放到最长边不超过 1600px，转码成 webp，
 * 从 quality=0.82 开始，如果结果还超过 5MB 就每次降 0.1，最低降到 0.5
 * 为止（到了这个下限还大就不再继续压，直接用当前结果上传）——这是跟
 * 产品确认过的参数，见 docs/02_SystemDesign/Architecture.md 15 节
 * "选择 → 客户端校验 → 压缩与转换 → 上传"。
 *
 * 调用方（post-image-storage-service.ts）负责在这个函数抛异常时回退到
 * 原始文件上传，这里不做任何兜底，抛出的异常原样往外传——常见的失败
 * 原因是浏览器不支持 createImageBitmap/canvas.toBlob，或者图片本身
 * 解码失败，这些都属于"压缩这条路走不通，退回不压缩上传"，不是这个
 * 函数自己应该吞掉的错误。
 *
 * jsdom（这个项目单测跑的环境）不会真的解码图片、不会真的渲染 canvas，
 * 这个函数本身没有针对性的单元测试——上传流程那边的测试是靠 mock 这个
 * 函数来验证"压缩成功/失败各自的分支"，压缩算法本身有没有真的把图片
 * 变小，需要在真实浏览器里用一张大图手动验证。
 */

const MAX_DIMENSION_PX = 1600;
const TARGET_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const INITIAL_QUALITY = 0.82;
const QUALITY_STEP = 0.1;
const MIN_QUALITY = 0.5;

function renameToWebp(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${base}.webp`;
}

function canvasToWebpBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

export async function compressImageToWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2d canvas context unavailable");
    }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    let quality = INITIAL_QUALITY;
    let blob = await canvasToWebpBlob(canvas, quality);
    while (blob.size > TARGET_MAX_SIZE_BYTES && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP);
      blob = await canvasToWebpBlob(canvas, quality);
    }

    return new File([blob], renameToWebp(file.name), { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}
