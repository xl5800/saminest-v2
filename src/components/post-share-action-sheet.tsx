import { Clipboard } from "@capacitor/clipboard";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PRODUCTION_ORIGIN } from "../utils/constants";

export interface PostShareActionSheetProps {
  postId: string;
  /** 点"分享到微信"时调用——实际逻辑（@capacitor/share 的系统原生分享面板）
   *  留在 post-detail-page.tsx 里，因为它需要 data.title/价格文案拼分享
   *  文案，这个弹层组件本身只管"展示三个选项、点了之后做什么"，不需要知道
   *  帖子标题/价格这些跟分享内容相关的字段。 */
  onShareToWechat: () => void;
  onClose: () => void;
}

type ShareOptionKey = "copy" | "wechat" | "report";

interface ShareOption {
  key: ShareOptionKey;
  emoji: string;
  label: string;
}

const OPTIONS: ShareOption[] = [
  { key: "copy", emoji: "🔗", label: "复制链接" },
  { key: "wechat", emoji: "💬", label: "分享到微信" },
  { key: "report", emoji: "🚩", label: "举报" }
];

/**
 * 帖子详情页点击底部工具栏"分享"图标弹出的自定义底部弹层——跟
 * publish-action-sheet.tsx 是同一套"fixed inset-0 + 本地 state + Esc/背景
 * 点击关闭 + 锁 body 滚动"模式，同样没有引入新的 Dialog/Modal 组件，遮罩色
 * 也是同一个 bg-black/40。
 *
 * 三个选项：
 * - 复制链接：把生产环境域名拼的帖子链接写入剪贴板（@capacitor/clipboard，
 *   这个插件在纯浏览器环境下会自动降级用标准 navigator.clipboard.writeText，
 *   跟 @capacitor/share 在 handleShare() 里的降级方式是同一个模式，不用
 *   自己再写一层 Web/原生分支）。复制成功后在弹层里显示一行 role="status"
 *   文字反馈（这个仓库目前展示"轻量成功提示"的写法就是这样，比如
 *   post-detail-page.tsx 自己的 publishSuccessMessage 横幅），不引入新的
 *   toast 库；这一项点击后弹层不关闭，让用户看到反馈之后自己关掉。
 * - 分享到微信：不接入微信开放平台 SDK，只是把"调用系统原生分享面板"这个
 *   已有能力（onShareToWechat，实际是 handleShare()）包在这个选项背后，
 *   点击后立即关闭弹层——系统分享面板本身会覆盖在上面，没必要留着这个弹层。
 * - 举报：现有路由 /post/:id/report，逻辑没有变化，只是入口从原来内容区
 *   的图标链接搬到这个弹层里。
 */
export function PostShareActionSheet({ postId, onShareToWechat, onClose }: PostShareActionSheetProps) {
  const navigate = useNavigate();
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function handleCopyLink(): Promise<void> {
    setCopyFeedback(null);
    try {
      await Clipboard.write({ string: `${PRODUCTION_ORIGIN}/post/${postId}` });
      setCopyFeedback("链接已复制");
    } catch (error) {
      // 跟 handleShare() 同一个态度：复制失败不是用户能操作纠正的场景
      // （权限被浏览器拒绝之类），静默吞掉、只留控制台日志，不额外弹一个
      // "复制失败"提示吓用户。
      console.error("复制链接失败：", error);
    }
  }

  function handleSelect(option: ShareOption): void {
    if (option.key === "copy") {
      void handleCopyLink();
      return;
    }
    if (option.key === "wechat") {
      onClose();
      onShareToWechat();
      return;
    }
    onClose();
    navigate(`/post/${postId}/report`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="分享"
      className="fixed inset-0 z-30 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-profile-card bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm font-medium text-text-muted">分享</p>
        {copyFeedback ? (
          <p role="status" className="mb-3 text-center text-sm text-primary">
            {copyFeedback}
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {OPTIONS.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => handleSelect(option)}
                className="flex w-full items-center gap-3 rounded-xl bg-bg px-4 py-3 text-left text-base font-semibold text-text"
              >
                <span aria-hidden="true" className="text-xl">
                  {option.emoji}
                </span>
                {option.label}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-border px-4 py-3 text-base font-medium text-text hover:bg-bg"
        >
          取消
        </button>
      </div>
    </div>
  );
}
