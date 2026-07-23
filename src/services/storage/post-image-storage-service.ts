import { getSupabaseClient } from "../../integrations/supabase/client";
import { AppError } from "../../utils/app-error";
import { compressImageToWebp } from "./compress-post-image";

const POST_IMAGES_BUCKET = "post-images";

/**
 * 只在压缩失败、退回上传原始文件时才用得到——扩展名按文件真实的 MIME
 * 类型决定，覆盖 post-image-picker.tsx 已经校验过的三种类型。压缩成功
 * 时统一是 .webp，不查这张表（见 uploadPostImage 里的分支）。
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export interface UploadPostImageInput {
  file: File;
  userId: string;
  postId: string;
}

export interface UploadPostImageResult {
  storagePath: string;
  publicUrl: string | null;
  mimeType: string;
  sizeBytes: number;
}

/**
 * 生成的唯一图片 ID 做文件名，不用原始文件名（见 Architecture.md 15 节
 * "文件名使用生成的唯一 ID，不使用原始文件名"）。
 */
function resolveExtension(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) {
    throw new AppError(
      `不支持的图片类型：${mimeType}`,
      "POST_IMAGE_UNSUPPORTED_MIME_TYPE"
    );
  }
  return extension;
}

export const postImageStorageService = {
  /**
   * 上传单张已经在选择器里校验过的图片。path 必须是
   * `{user_id}/{post_id}/{image_id}.<ext>`（不带 bucket 名前缀），
   * 因为 storage.objects 的 RLS 策略是用路径第一段匹配 auth.uid()
   * （见 supabase/migrations/20260716000100_storage_post_images_policies.sql），
   * 如果这里再拼一次 "post-images/" 前缀，第一段就变成了 bucket 名，
   * 会导致所有用户的上传都被拒绝。
   *
   * 上传前先尝试压缩成 webp（见 compress-post-image.ts）——手机相机原图
   * 常见 8-15MB，选图阶段（post-image-picker.tsx）只做 20MB 的兜底拦截，
   * 真正把体积降下来靠这一步。压缩失败（浏览器不支持相关 API、图片解码
   * 失败等）不让整个上传失败，退回用原始文件、按它自己的 MIME 类型
   * 上传——这条失败路径已经在 publish-page.tsx 的"部分图片上传失败"
   * 容错提示里覆盖，不需要额外的 UI。
   *
   * width/height 留给调用方按需补充（例如用 Image 读取尺寸后再拼装
   * post_images 的 insert 行），这个方法本身不读取图片尺寸，避免为了
   * 一个次要字段引入额外的图片解码逻辑。
   */
  async uploadPostImage(input: UploadPostImageInput): Promise<UploadPostImageResult> {
    const { file, userId, postId } = input;
    const imageId = crypto.randomUUID();

    let uploadFile: File;
    let extension: string;
    try {
      uploadFile = await compressImageToWebp(file);
      extension = "webp";
    } catch {
      uploadFile = file;
      extension = resolveExtension(file.type);
    }

    const path = `${userId}/${postId}/${imageId}.${extension}`;

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, uploadFile, {
      contentType: uploadFile.type
    });

    if (error) {
      throw new AppError(error.message, "POST_IMAGE_UPLOAD_FAILED", error);
    }

    const { data: publicUrlData } = supabase.storage
      .from(POST_IMAGES_BUCKET)
      .getPublicUrl(path);

    return {
      storagePath: path,
      publicUrl: publicUrlData?.publicUrl ?? null,
      mimeType: uploadFile.type,
      sizeBytes: uploadFile.size
    };
  },

  /**
   * 补偿清理：Storage 已经上传成功、但紧接着的 post_images 数据库记录
   * 没能写入时用——只删调用方明确给出的这几个 path（这一批刚上传、还没
   * 落库的孤儿文件），不做"扫描这个帖子底下所有文件再挑一批删"这种更
   * 危险的操作，不会碰到帖子已有的旧图片。
   *
   * 这个方法本身失败时会抛 AppError，调用方（publish-page.tsx）需要
   * 自己 catch 住，不能让"清理失败"盖过原本的"数据库写入失败"这个更
   * 重要的错误——两个错误都要能看到。
   */
  async removePostImageFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).remove(paths);

    if (error) {
      throw new AppError(error.message, "POST_IMAGE_CLEANUP_FAILED", error);
    }
  }
};

export type PostImageStorageService = typeof postImageStorageService;
