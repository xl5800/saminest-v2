import { getSupabaseClient } from "../../integrations/supabase/client";
import { AppError } from "../../utils/app-error";
import { compressImageToWebp } from "./compress-post-image";

const AVATARS_BUCKET = "avatars";

/**
 * 只在压缩失败、退回上传原始文件时才用得到——扩展名按文件真实的 MIME
 * 类型决定，覆盖 avatar-picker.tsx 已经校验过的三种类型。压缩成功时
 * 统一是 .webp，不查这张表（见 uploadAvatar 里的分支）。跟
 * post-image-storage-service.ts/feedback-image-storage-service.ts 里同名
 * 的表完全一样，这里没有复用那两份而是重新声明一次，理由见这个文件顶部
 * 的整体说明。
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export interface UploadAvatarInput {
  file: File;
  userId: string;
}

export interface UploadAvatarResult {
  storagePath: string;
  publicUrl: string | null;
  mimeType: string;
  sizeBytes: number;
}

function resolveExtension(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) {
    throw new AppError(`不支持的图片类型：${mimeType}`, "AVATAR_UNSUPPORTED_MIME_TYPE");
  }
  return extension;
}

/**
 * 这个文件是 post-image-storage-service.ts 的同构复刻，不是从那个文件
 * 抽取/导入的共享代码——跟 feedback-image-storage-service.ts 顶部说明的
 * 理由一样：核心逻辑（压缩失败回退、按 MIME 决定扩展名、上传路径拼接、
 * 孤儿文件清理）加起来不到 100 行，两边唯一的调用方各自只有一个（发布
 * 表单 / 编辑资料页头像），抽成一个"通用图片上传服务"需要把 bucket 名、
 * 路径结构（帖子多一层 post_id，头像没有）都做成参数，换来的复用收益
 * 压不过额外的间接层。真正跨这几个文件共享、没有重复实现的是
 * compressImageToWebp（纯函数，不认识"帖子/反馈/头像"这个概念）——这里
 * 直接 import 复用，没有重新写一遍压缩逻辑。
 */
export const avatarStorageService = {
  /**
   * 上传单张已经在 avatar-picker.tsx 里校验过的头像图片。path 必须是
   * `{user_id}/{image_id}.<ext>`（不带 bucket 名前缀，也没有 post-images
   * 那种 post_id 中间层——头像不属于任何具体实体），因为 storage.objects
   * 的 RLS 策略是用路径第一段匹配 auth.uid()（见
   * supabase/migrations/20260818070203_storage_avatars_bucket_and_policies.sql）。
   *
   * 上传前先尝试压缩成 webp，逻辑跟 uploadPostImage 完全一致：压缩失败
   * （浏览器不支持相关 API、图片解码失败等）不让整个上传失败，退回用
   * 原始文件、按它自己的 MIME 类型上传。
   *
   * avatars bucket 是 public: true（见迁移文件），所以这里也调
   * getPublicUrl() 拿一个能直接展示的地址——跟 feedback-images（私有
   * bucket，不调 getPublicUrl）不同，头像需要在公开个人主页/消息列表等
   * 场景直接展示，包括未登录游客也要能看到。
   */
  async uploadAvatar(input: UploadAvatarInput): Promise<UploadAvatarResult> {
    const { file, userId } = input;
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

    const path = `${userId}/${imageId}.${extension}`;

    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, uploadFile, {
      contentType: uploadFile.type
    });

    if (error) {
      throw new AppError(error.message, "AVATAR_UPLOAD_FAILED", error);
    }

    const { data: publicUrlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);

    return {
      storagePath: path,
      publicUrl: publicUrlData?.publicUrl ?? null,
      mimeType: uploadFile.type,
      sizeBytes: uploadFile.size
    };
  },

  /**
   * 换头像成功（新头像已经上传、profiles.avatar_url 已经更新）之后，
   * 调用方尝试删除旧头像文件用——avatars bucket 没有 update 策略（见迁移
   * 文件说明），每次换头像都是新 insert 一个新 id 的文件，旧文件需要
   * 客户端事后单独调用这个方法清理，不是数据库那边自动处理的。
   *
   * 只接受单个 path（不是 post-image-storage-service.ts 那种批量
   * paths[]）——一个用户任意时刻只有一张"当前头像"，这里天然就是"删掉
   * 那一张旧的"，没有批量删除的场景。
   *
   * 这个方法本身失败时会抛 AppError，调用方（edit-profile-page.tsx）
   * 需要自己 catch 住，不能让"旧文件清理失败"盖过"新头像已经上传/写库
   * 成功"这个更重要的结果——旧头像变成一个不再被引用的孤儿文件，只是
   * 浪费一点 Storage 空间，不影响用户看到的效果。
   */
  async removeAvatarFile(path: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.storage.from(AVATARS_BUCKET).remove([path]);

    if (error) {
      throw new AppError(error.message, "AVATAR_CLEANUP_FAILED", error);
    }
  }
};

/**
 * 从 uploadAvatar() 返回、最终存进 profiles.avatar_url 的完整公开 URL 里
 * 反解出 storage path（{user_id}/{image_id}.<ext>）——换头像成功后要清理
 * 旧头像文件，但数据库只存了旧头像的 publicUrl（profiles.avatar_url），
 * 没有单独存过它的 storage path 这一列，只能从 URL 反解。Supabase 的
 * public URL 固定形如 ".../storage/v1/object/public/avatars/{path}"，
 * 按 "/avatars/" 这个 bucket 名分隔符切一刀即可，不需要完整解析 URL
 * 结构（new URL() + pathname 拆分）这种更重的写法。
 *
 * 解析不出来（比如 URL 格式以后变了，或者传进来的根本不是这个 bucket
 * 的 URL）返回 null，不抛错——调用方（edit-profile-page.tsx）把这种情况
 * 当成"没有旧文件可以清理"，跳过删除，不阻塞换头像这个主流程。
 */
export function parseAvatarStoragePathFromUrl(url: string): string | null {
  const marker = "/avatars/";
  const index = url.indexOf(marker);
  if (index === -1) {
    return null;
  }
  const path = url.slice(index + marker.length).split("?")[0];
  return path || null;
}

export type AvatarStorageService = typeof avatarStorageService;
