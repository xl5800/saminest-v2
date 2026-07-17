import { getSupabaseClient } from "../../integrations/supabase/client";
import { AppError } from "../../utils/app-error";

const POST_IMAGES_BUCKET = "post-images";

/**
 * 只支持 publish-page 图片选择器已经校验过的三种类型（见
 * post-image-picker.tsx），扩展名按文件真实的 MIME 类型决定，
 * 本阶段不做压缩/转码，不强制统一成 .webp
 * （docs/02_SystemDesign/Architecture.md 15 节的 .webp 示例路径
 * 是压缩后的推荐做法，压缩本身不在这一阶段范围内，已经和产品确认）。
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
   * width/height 留给调用方按需补充（例如用 Image 读取尺寸后再拼装
   * post_images 的 insert 行），这个方法本身不读取图片尺寸，避免为了
   * 一个次要字段引入额外的图片解码逻辑。
   */
  async uploadPostImage(input: UploadPostImageInput): Promise<UploadPostImageResult> {
    const { file, userId, postId } = input;
    const imageId = crypto.randomUUID();
    const extension = resolveExtension(file.type);
    const path = `${userId}/${postId}/${imageId}.${extension}`;

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(POST_IMAGES_BUCKET).upload(path, file, {
      contentType: file.type
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
      mimeType: file.type,
      sizeBytes: file.size
    };
  }
};

export type PostImageStorageService = typeof postImageStorageService;
