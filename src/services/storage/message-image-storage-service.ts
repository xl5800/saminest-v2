import { getSupabaseClient } from "../../integrations/supabase/client";
import { AppError } from "../../utils/app-error";
import { compressImageToWebp } from "./compress-post-image";

const MESSAGE_IMAGES_BUCKET = "message-images";

/**
 * 只在压缩失败、退回上传原始文件时才用得到——扩展名按文件真实的 MIME
 * 类型决定，覆盖 conversation-page.tsx 图片选择器已经校验过的三种类型。
 * 跟 feedback-image-storage-service.ts/post-image-storage-service.ts 里
 * 同名的表完全一样，这里没有复用那两份而是重新声明一次，理由见这个
 * 文件顶部的整体说明（跟 feedback-image-storage-service.ts 是同一个
 * "各自独立演进，核心逻辑体量小，不值得为两三个调用方提前抽共享模块"
 * 的取舍）。
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export interface UploadMessageImageInput {
  file: File;
  conversationId: string;
}

export interface UploadMessageImageResult {
  imagePath: string;
}

function resolveExtension(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) {
    throw new AppError(
      `不支持的图片类型：${mimeType}`,
      "MESSAGE_IMAGE_UNSUPPORTED_MIME_TYPE"
    );
  }
  return extension;
}

/**
 * 联系客服改成真聊天任务卡：聊天消息的图片上传服务，流程照抄
 * feedback-image-storage-service.ts（压缩失败回退原始文件、按 MIME 决定
 * 扩展名、上传路径拼接、孤儿文件清理），真正共享的
 * compressImageToWebp（纯函数）直接 import 复用，不重新写一遍压缩逻辑。
 *
 * 跟 feedback-image-storage-service.ts 不同的一点是路径形状：反馈截图是
 * `{user_id}/{feedback_id}/{image_id}.<ext>`（只有上传者本人+管理员能看，
 * 按用户身份分文件夹）；这次是聊天场景，图片要在会话双方（用户自己+
 * 管理员，如果以后扩展到两个真实用户之间也一样）之间都能看到，归属
 * 判断因此从"路径第一段是不是我的 user_id"换成"路径第一段对应的会话，
 * 我是不是这个会话的成员"，路径也就换成 `{conversation_id}/{image_id}.
 * <ext>`（不含 user_id），见 message-images 桶的 RLS 策略定义（
 * add_message_images_and_bucket.sql）。
 *
 * message-images 是私有桶（public: false）——这里同样不调用
 * getPublicUrl()，上传结果只返回 Storage 路径本身，不生成/存任何"公开
 * 地址"字段，避免重蹈 feedback_images.public_url 那次"存了一个私有桶
 * 生成不出来的地址，后台从此再也显示不出一张图"的覆辙。前端展示时按需
 * 用 createSignedUrl()/createSignedUrls() 现签一个有时效的地址，见
 * messages-repository.ts listMessages() 里的用法。
 */
export const messageImageStorageService = {
  async uploadMessageImage(
    input: UploadMessageImageInput
  ): Promise<UploadMessageImageResult> {
    const { file, conversationId } = input;
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

    const path = `${conversationId}/${imageId}.${extension}`;

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(MESSAGE_IMAGES_BUCKET)
      .upload(path, uploadFile, { contentType: uploadFile.type });

    if (error) {
      throw new AppError(error.message, "MESSAGE_IMAGE_UPLOAD_FAILED", error);
    }

    return { imagePath: path };
  },

  /**
   * 补偿清理：Storage 已经上传成功、但紧接着的 sendMessage()/
   * admin_reply_to_support_conversation() 没能把这条消息写进
   * messages 表时用——跟 feedback-image-storage-service.ts 的
   * removeFeedbackImageFiles 是同一个模式，失败时抛 AppError，调用方
   * 需要自己 catch 住，不能让"清理失败"盖过原本更重要的"发送失败"错误。
   */
  async removeMessageImageFile(imagePath: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage
      .from(MESSAGE_IMAGES_BUCKET)
      .remove([imagePath]);

    if (error) {
      throw new AppError(error.message, "MESSAGE_IMAGE_CLEANUP_FAILED", error);
    }
  }
};

export type MessageImageStorageService = typeof messageImageStorageService;
