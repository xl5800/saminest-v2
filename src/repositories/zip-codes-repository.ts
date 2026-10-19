import { getSupabaseClient } from "../integrations/supabase/client";
import { AppError } from "../utils/app-error";

/** 发布页 ZIP 定位任务卡：一个美国邮编对应的城市和州。 */
export interface ZipCodeLocation {
  zip: string;
  city: string;
  stateCode: string;
}

export const ZIP_CODE_PATTERN = /^\d{5}$/;

/**
 * 按 5 位邮编查城市 / 州（public.zip_codes，GeoNames 数据，见
 * supabase/migrations/20261019030000_add_zip_codes.sql）。查不到返回 null，
 * 由发布页提示用户手动选择地区。
 */
export async function lookupZipCode(zip: string): Promise<ZipCodeLocation | null> {
  if (!ZIP_CODE_PATTERN.test(zip)) return null;

  const { data, error } = await getSupabaseClient()
    .from("zip_codes")
    .select("zip, city, state_code")
    .eq("zip", zip)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, "ZIP_CODE_LOOKUP_FAILED", error);
  }
  if (!data) return null;

  return { zip: data.zip, city: data.city, stateCode: data.state_code };
}
