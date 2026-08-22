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

export interface FeedbackImageListItem {
  id: string;
  publicUrl: string;
}

interface FeedbackImageBatchRow {
  id: string;
  feedback_id: string;
  public_url: string | null;
}

/**
 * 管理员反馈处理页（/admin/feedback）截图缩略图用：按一批 feedbackId 一次性
 * 批量查询，按 feedbackId 分组成 Map——跟 activities-repository.ts 的
 * listActivityParticipantPreviews 是同一个"批量查、按父 id 分组"模式，不对
 * 每条反馈单独发一次截图查询（N+1）。
 *
 * 不用额外加 `.eq("deleted_at", null)` 之类的过滤——
 * feedback_images_select_own_or_admin 这条 RLS（见
 * supabase/migrations/20260724000000_create_feedback_tables.sql）的 using
 * 子句本身就要求 `deleted_at is null`，对管理员和本人两个分支都生效，数据库
 * 层面已经保证不会返回软删除的行，这里不需要重复判断。
 *
 * publicUrl 为 null 的行（理论上不应该出现——插入截图行时
 * public_url 由上传流程直接给出，见 uploadAndInsertFeedbackImages）直接跳过
 * 不展示，不用一个空字符串或占位图硬撑一个没有图可显示的缩略图位。
 */
export async function listFeedbackImagesByFeedbackIds(
  feedbackIds: string[]
): Promise<Map<string, FeedbackImageListItem[]>> {
  if (feedbackIds.length === 0) {
    return new Map();
  }

  const { data, error } = await getSupabaseClient()
    .from("feedback_images")
    .select("id, feedback_id, public_url")
    .in("feedback_id", feedbackIds)
    .order("sort_order", { ascending: true })
    .overrideTypes<FeedbackImageBatchRow[]>();

  if (error) {
    throw new AppError(error.message, "FEEDBACK_IMAGES_BATCH_LIST_FAILED", error);
  }

  const imagesByFeedback = new Map<string, FeedbackImageListItem[]>();
  for (const row of data ?? []) {
    if (!row.public_url) continue;
    const existing = imagesByFeedback.get(row.feedback_id);
    const image = { id: row.id, publicUrl: row.public_url };
    if (existing) {
      existing.push(image);
    } else {
      imagesByFeedback.set(row.feedback_id, [image]);
    }
  }
  return imagesByFeedback;
}
