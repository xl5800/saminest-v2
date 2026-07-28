import { getSupabaseClient } from "../integrations/supabase/client";
import type { TablesInsert } from "../types/database.generated";
import { AppError } from "../utils/app-error";

export interface CreateFeedbackImageInput {
  feedbackId: string;
  ownerId: string;
  storagePath: string;
  publicUrl: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  mimeType: string | null;
  sortOrder: number;
}

export interface FeedbackImageRecord {
  id: string;
  feedbackId: string;
  storagePath: string;
  publicUrl: string | null;
  sortOrder: number;
}

/**
 * 提交反馈的截图上传流程用这个方法批量写入 feedback_images 行（先把文件
 * 传到 Storage，再用这个方法把每张图片的路径/元数据落库），一次 insert
 * 多行，不为每张图片单独发一次请求——跟 post-images-repository.ts 的
 * insertPostImages 是同一个模式，这次没有 alt_text 这一列（feedback_images
 * 的字段列表本来就没有它，不是漏写）。
 *
 * owner_id / feedback_id 的越权保护交给数据库 RLS（见
 * supabase/migrations/20260724000000_create_feedback_tables.sql 的
 * feedback_images_insert_own_feedback 策略），这里不重复做权限判断。
 */
export async function insertFeedbackImages(
  inputs: CreateFeedbackImageInput[]
): Promise<FeedbackImageRecord[]> {
  if (inputs.length === 0) {
    return [];
  }

  const payload: TablesInsert<"feedback_images">[] = inputs.map((input) => ({
    feedback_id: input.feedbackId,
    owner_id: input.ownerId,
    storage_path: input.storagePath,
    public_url: input.publicUrl,
    width: input.width,
    height: input.height,
    size_bytes: input.sizeBytes,
    mime_type: input.mimeType,
    sort_order: input.sortOrder
  }));

  const { data, error } = await getSupabaseClient()
    .from("feedback_images")
    .insert(payload)
    .select("id, feedback_id, storage_path, public_url, sort_order");

  if (error) {
    throw new AppError(error.message, "FEEDBACK_IMAGES_INSERT_FAILED", error);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    feedbackId: row.feedback_id,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    sortOrder: row.sort_order
  }));
}
