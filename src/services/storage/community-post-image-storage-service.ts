import { getSupabaseClient } from "../../integrations/supabase/client";
import { AppError } from "../../utils/app-error";
import { compressImageToWebp } from "./compress-post-image";

const COMMUNITY_POST_IMAGES_BUCKET = "community-post-images";

/**
 * 只在压缩失败、退回上传原始文件时才用得到——跟 post-image-storage-service.ts
 * 同一张表：扩展名按文件真实的 MIME 类型决定，覆盖 post-image-picker.tsx 已经
 * 校验过的三种类型。压缩成功时统一是 .webp，不查这张表。
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export interface UploadCommunityPostImageInput {
  file: File;
  userId: string;
  communityPostId: string;
}

export interface UploadCommunityPostImageResult {
  storagePath: string;
  // getPublicUrl 理论上总会返回一个 URL，但类型上是可选的，跟
  // post-image-storage-service.ts 的 UploadPostImageResult 保持一致，不在
  // 这里假定它一定有值（community_post_images.public_url 本身也是可空列）。
  publicUrl: string | null;
  sizeBytes: number;
  mimeType: string;
}

function resolveExtension(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) {
    throw new AppError(
      `不支持的图片类型：${mimeType}`,
      "COMMUNITY_POST_IMAGE_UNSUPPORTED_MIME_TYPE"
    );
  }
  return extension;
}

/**
 * 社区帖子图片的 Storage 服务，镜像 post-image-storage-service.ts——压缩逻辑
 * （compressImageToWebp）是跟帖子无关的纯图片处理函数，直接导入复用；区别
 * 只有目标 bucket（独立的 community-post-images，见
 * supabase/migrations/20261008173514_community_post_images_table_and_bucket.sql）
 * 和路径里的 id 片段（communityPostId）。
 */
export const communityPostImageStorageService = {
  /**
   * 上传单张已经在选择器里校验过的图片。path 必须是
   * `{user_id}/{community_post_id}/{image_id}.<ext>`（不带 bucket 名前缀）：
   * storage.objects 的 RLS 策略用路径第一段匹配 auth.uid()，多拼一层 bucket
   * 名前缀会让第一段变成 bucket 名、所有上传都被拒绝。
   *
   * 上传前先尝试压缩成 webp；压缩失败不让整个上传失败，退回上传原始文件
   * （按它自己的 MIME 类型），跟帖子图片同一个降级策略。
   */
  async uploadCommunityPostImage(
    input: UploadCommunityPostImageInput
  ): Promise<UploadCommunityPostImageResult> {
    const { file, userId, communityPostId } = input;
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

    const path = `${userId}/${communityPostId}/${imageId}.${extension}`;

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(COMMUNITY_POST_IMAGES_BUCKET)
      .upload(path, uploadFile, { contentType: uploadFile.type });

    if (error) {
      throw new AppError(error.message, "COMMUNITY_POST_IMAGE_UPLOAD_FAILED", error);
    }

    const { data: publicUrlData } = supabase.storage
      .from(COMMUNITY_POST_IMAGES_BUCKET)
      .getPublicUrl(path);

    return {
      storagePath: path,
      publicUrl: publicUrlData?.publicUrl ?? null,
      sizeBytes: uploadFile.size,
      mimeType: uploadFile.type
    };
  },

  /**
   * 补偿清理：Storage 已经上传成功、但紧接着的 community_post_images 数据库
   * 记录没能写入时用——只删调用方明确给出的这几个 path（这一批刚上传、还没
   * 落库的孤儿文件）。这个方法本身失败时会抛 AppError，调用方需要自己 catch
   * 住，不能让"清理失败"盖过原本的"数据库写入失败"。
   */
  async removeCommunityPostImageFiles(storagePaths: string[]): Promise<void> {
    if (storagePaths.length === 0) {
      return;
    }

    const { error } = await getSupabaseClient()
      .storage.from(COMMUNITY_POST_IMAGES_BUCKET)
      .remove(storagePaths);

    if (error) {
      throw new AppError(error.message, "COMMUNITY_POST_IMAGE_CLEANUP_FAILED", error);
    }
  }
};

export type CommunityPostImageStorageService = typeof communityPostImageStorageService;
