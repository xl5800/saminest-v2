import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

export interface CreatePostImageInput {
  postId: string;
  ownerId: string;
  storagePath: string;
  publicUrl: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  mimeType: string | null;
  sortOrder: number;
}

export interface PostImageRecord {
  id: string;
  postId: string;
  storagePath: string;
  publicUrl: string | null;
  sortOrder: number;
}

/**
 * 发布表单的图片上传流程用这个方法批量写入 post_images 行（先把文件传到
 * Storage，再用这个方法把每张图片的路径/元数据落库），一次 insert 多行，
 * 不为每张图片单独发一次请求。
 *
 * owner_id / post_id 的越权保护交给数据库 RLS（见
 * supabase/migrations/20260716000000_create_post_images_table.sql 的
 * post_images_insert_own_post 策略），这里不重复做权限判断。
 */
export async function insertPostImages(
  inputs: CreatePostImageInput[]
): Promise<PostImageRecord[]> {
  if (inputs.length === 0) {
    return [];
  }

  const payload: TablesInsert<"post_images">[] = inputs.map((input) => ({
    post_id: input.postId,
    owner_id: input.ownerId,
    storage_path: input.storagePath,
    public_url: input.publicUrl,
    alt_text: input.altText,
    width: input.width,
    height: input.height,
    size_bytes: input.sizeBytes,
    mime_type: input.mimeType,
    sort_order: input.sortOrder
  }));

  const { data, error } = await getSupabaseClient()
    .from("post_images")
    .insert(payload)
    .select("id, post_id, storage_path, public_url, sort_order");

  if (error) {
    throw new AppError(error.message, "POST_IMAGES_INSERT_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    postId: row.post_id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    sortOrder: row.sort_order
  }));
}
