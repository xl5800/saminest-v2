/**
 * 发布页 ZIP 定位任务卡：记住上次发帖 / 发起活动时填的邮编，下次新建自动带上
 * （大多数人一直在同一个地方发帖）。帖子发布页和找搭子发起页共用同一个值。
 * 只是个人便利，读写失败（隐私模式等）就当没记过。
 */
export const LAST_ZIP_CODE_STORAGE_KEY = "saminest.last-zip-code";

export function readLastZipCode(): string {
  try {
    return window.localStorage.getItem(LAST_ZIP_CODE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeLastZipCode(zip: string): void {
  try {
    window.localStorage.setItem(LAST_ZIP_CODE_STORAGE_KEY, zip);
  } catch {
    // 存不了就算了。
  }
}
