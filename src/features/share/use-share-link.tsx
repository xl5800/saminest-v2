import { useEffect, useState } from "react";

import { type ContentType, track } from "../analytics/track";
import { shareLink, type ShareLinkInput } from "./share-link";

const COPIED_TOAST_MS = 2000;

/**
 * 详情页分享按钮用：调用 shareLink()，并负责它需要的两种界面反馈——
 * 微信里的"点右上角转发"引导遮罩、电脑浏览器里的"链接已复制"提示。
 * 页面把 shareUi 渲染在自己的 JSX 里即可。
 */
export function useShareLink() {
  const [showWechatGuide, setShowWechatGuide] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    if (!showCopied) return;
    const timer = setTimeout(() => setShowCopied(false), COPIED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [showCopied]);

  /** analyticsType：数据分析任务卡，记 share_clicked 时区分分享的是什么。 */
  async function share(input: ShareLinkInput, analyticsType: ContentType | "community"): Promise<void> {
    track("share_clicked", { type: analyticsType });
    let result;
    try {
      result = await shareLink(input);
    } catch (error) {
      // shareLink 自己已经把各端的失败/取消吞掉了，这里再兜一层，分享按钮
      // 永远不会把异常抛给页面。
      console.error("分享失败：", error);
      return;
    }
    if (result === "wechat-guide") setShowWechatGuide(true);
    if (result === "copied") setShowCopied(true);
  }

  const shareUi = (
    <>
      {showWechatGuide ? (
        <div
          role="dialog"
          aria-label="分享引导"
          className="fixed inset-0 z-50 bg-black/70"
          onClick={() => setShowWechatGuide(false)}
        >
          <div className="absolute right-6 top-3 flex flex-col items-end text-white">
            <svg aria-hidden="true" width="72" height="72" viewBox="0 0 72 72" fill="none">
              <path
                d="M14 66 C 30 50, 48 34, 60 10"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path d="M48 12 L 60 8 L 62 21" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-right text-lg font-semibold leading-relaxed">
              点击右上角「···」
              <br />
              发送给朋友或分享到朋友圈
            </p>
            <p className="mt-4 text-sm text-white/70">点任意处关闭</p>
          </div>
        </div>
      ) : null}
      {showCopied ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit rounded-full bg-black/80 px-4 py-2 text-sm text-white"
        >
          链接已复制
        </div>
      ) : null}
    </>
  );

  return { share, shareUi };
}
