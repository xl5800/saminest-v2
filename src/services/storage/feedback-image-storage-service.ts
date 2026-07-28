import { getSupabaseClient } from "../../integrations/supabase/client";
import { AppError } from "../../utils/app-error";
import { compressImageToWebp } from "./compress-post-image";

const FEEDBACK_IMAGES_BUCKET = "feedback-images";

/**
 * 只在压缩失败、退回上传原始文件时才用得到——扩展名按文件真实的 MIME
 * 类型决定，覆盖 feedback-image-picker.tsx 已经校验过的三种类型。压缩
 * 成功时统一是 .webp，不查这张表（见 uploadFeedbackImage 里的分支）。
 * 跟 post-image-storage-service.ts 里同名的表完全一样，这里没有复用那
 * 一份而是重新声明一次，理由见这个文件顶部的整体说明。
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export interface UploadFeedbackImageInput {
  file: File;
  userId: string;
  feedbackId: string;
}

export interface UploadFeedbackImageResult {
  storagePath: string;
  publicUrl: string | null;
  mimeType: string;
  sizeBytes: number;
}

function resolveExtension(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) {
    throw new AppError(
      `不支持的图片类型：${mimeType}`,
      "FEEDBACK_IMAGE_UNSUPPORTED_MIME_TYPE"
    );
  }
  return extension;
}

/**
 * 这个文件是 post-image-storage-service.ts 的同构复刻，不是从那个文件
 * 抽取/导入的共享代码——两边唯一的调用方各自只有一个（发布表单 / 提交
 * 反馈表单），核心逻辑（压缩失败回退、按 MIME 决定扩展名、上传路径
 * 拼接、孤儿文件清理）加起来不到 100 行，抽成一个"通用图片上传服务"
 * 需要把 bucket 名、路径里的实体字段名（post_id vs feedback_id）都做成
 * 参数，换来的复用收益（现在只有两个调用方）压不过"改动一个刚在今晚
 * 出过真实 bug 的文件（post-image-storage-service.ts）去支撑一个新功能"
 * 这个风险——如果以后出现第三个需要压缩上传图片的场景，那才是抽公共
 * 模块的合适时机，现在为两个调用方提前抽象是过度设计。
 *
 * 真正跨两边共享、没有重复实现的是 compressImageToWebp（纯函数，不认识
 * "帖子"还是"反馈"这个概念）——这里直接 import 复用，没有重新写一遍
 * 压缩逻辑。
 */
export const feedbackImageStorageService = {
  /**
   * 上传单张已经在选择器里校验过的截图。path 必须是
   * `{user_id}/{feedback_id}/{image_id}.<ext>`（不带 bucket 名前缀），
   * 因为 storage.objects 的 RLS 策略是用路径第一段匹配 auth.uid()（见
   * supabase/migrations/20260724000100_storage_feedback_images_bucket_and_policies.sql）。
   *
   * 跟 uploadPostImage 不同的一点：这里不调用 getPublicUrl()，返回的
   * publicUrl 固定是 null——feedback-images 是私有 bucket
   * （public: false），getPublicUrl() 在私有 bucket 上生成的地址不带签名，
   * 直接访问会被拒绝，存一个用不了的地址没有意义。这一轮也没有任何页面
   * 需要把截图显示回去，以后接后台管理界面查看截图时，应该用
   * createSignedUrl() 按需现签一个有时效的地址，不依赖这个字段。
   */
  async uploadFeedbackImage(
    input: UploadFeedbackImageInput
  ): Promise<UploadFeedbackImageResult> {
    const { file, userId, feedbackId } = input;
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

    const path = `${userId}/${feedbackId}/${imageId}.${extension}`;

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(FEEDBACK_IMAGES_BUCKET)
      .upload(path, uploadFile, { contentType: uploadFile.type });

    if (error) {
      throw new AppError(error.message, "FEEDBACK_IMAGE_UPLOAD_FAILED", error);
    }

    return {
      storagePath: path,
      publicUrl: null,
      mimeType: uploadFile.type,
      sizeBytes: uploadFile.size
    };
  },

  /**
   * 补偿清理：Storage 已经上传成功、但紧接着的 feedback_images 数据库
   * 记录没能写入时用——只删调用方明确给出的这几个 path（这一批刚上传、
   * 还没落库的孤儿文件）。跟 post-image-storage-service.ts 的
   * removePostImageFiles 是同一个模式：这个方法本身失败时会抛
   * AppError，调用方需要自己 catch 住，不能让"清理失败"盖过原本的
   * "数据库写入失败"这个更重要的错误。
   */
  async removeFeedbackImageFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(FEEDBACK_IMAGES_BUCKET)
      .remove(paths);

    if (error) {
      throw new AppError(error.message, "FEEDBACK_IMAGE_CLEANUP_FAILED", error);
    }
  }
};

export type FeedbackImageStorageService = typeof feedbackImageStorageService;
