import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

export interface CreateCommunityPostImageInput {
  communityPostId: string;
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

export interface CommunityPostImageRecord {
  id: string;
  communityPostId: string;
  storagePath: string;
  publicUrl: string | null;
  sortOrder: number;
}

/**
 * 发帖页的图片上传流程用这个方法批量写入 community_post_images 行（先把文件传
 * 到 Storage，再用这个方法把每张图片的路径/元数据落库），一次 insert 多行，
 * 镜像 post-images-repository.ts 的 insertPostImages——错误处理也一样：不区分
 * 唯一约束冲突/RLS 失败，统一归因成 COMMUNITY_POST_IMAGES_INSERT_FAILED，调用方
 * 只需要知道"这一批没写进去"，越权保护交给数据库 RLS（见
 * supabase/migrations/20261008173514_community_post_images_table_and_bucket.sql
 * 的 community_post_images_insert_own_post 策略）。
 */
export async function insertCommunityPostImages(
  inputs: CreateCommunityPostImageInput[]
): Promise<CommunityPostImageRecord[]> {
  if (inputs.length === 0) {
    return [];
  }

  const payload: TablesInsert<"community_post_images">[] = inputs.map((input) => ({
    community_post_id: input.communityPostId,
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
    .from("community_post_images")
    .insert(payload)
    .select("id, community_post_id, storage_path, public_url, sort_order");

  if (error) {
    throw new AppError(error.message, "COMMUNITY_POST_IMAGES_INSERT_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    communityPostId: row.community_post_id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    sortOrder: row.sort_order
  }));
}
