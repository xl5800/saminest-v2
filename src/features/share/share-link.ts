import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export interface ShareLinkInput {
  title: string;
  text: string;
  url: string;
}

export type ShareLinkResult = "shared" | "wechat-guide" | "copied" | "failed";

const WECHAT_UA_MARKER = "MicroMessenger";

export function isWechatBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes(WECHAT_UA_MARKER);
}

/**
 * 详情页"分享"按钮（微信内分享任务卡）。
 *
 * 原来直接调 Capacitor 的 Share.share()：在 App 里弹系统分享面板没问题，
 * 但在网页版里它走的是浏览器的 navigator.share，微信内置浏览器不支持，
 * 调用直接报错又被静默吞掉，用户点了没有任何反应。现在按环境分开：
 * - App（原生壳）：照旧弹系统分享面板；
 * - 微信内置浏览器：网页没有权限直接调起微信的转发（那需要公众号
 *   JS-SDK），返回 "wechat-guide"，由页面弹一个"点右上角 ··· 转发"的
 *   引导；微信自己的转发会读页面的分享卡片信息（middleware.ts 注入的
 *   og 标签）；
 * - 其它支持系统分享的浏览器（手机 Safari/Chrome）：navigator.share；
 * - 都不支持（电脑浏览器等）：复制链接，返回 "copied" 让页面提示。
 * 用户主动取消分享面板也会 reject，跟原来一样不当成错误提示给用户。
 */
export async function shareLink(input: ShareLinkInput): Promise<ShareLinkResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ ...input, dialogTitle: "分享" });
      return "shared";
    } catch (error) {
      console.error("分享失败：", error);
      return "failed";
    }
  }

  if (isWechatBrowser()) {
    return "wechat-guide";
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(input);
      return "shared";
    } catch (error) {
      console.error("分享失败：", error);
      return "failed";
    }
  }

  try {
    await navigator.clipboard.writeText(input.url);
    return "copied";
  } catch (error) {
    console.error("复制链接失败：", error);
    return "failed";
  }
}
