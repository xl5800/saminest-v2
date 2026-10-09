interface LeaveCommunityConfirmDialogProps {
  communityName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 退出社区前的确认弹窗。样式和结构照抄 my-community-posts-page.tsx /
 * my-posts-page.tsx 里内联的"居中 role="dialog" 确认弹窗"——项目里没有通用的
 * Dialog 组件，那几处都是各页面自己内联一份；退出社区要在社区浏览页卡片
 * （browse-community-card.tsx）和单个社区页头部（community-feed-page.tsx）两处
 * 用，所以抽成这一个小组件共用，而不是两边各抄一份。
 *
 * 弹窗只负责"问一下"：点"确认退出"调 onConfirm（调用方发起退出请求并关闭弹窗），
 * 请求进行中/失败的提示仍然由调用方原来的按钮状态和错误提示负责。
 */
export function LeaveCommunityConfirmDialog({
  communityName,
  onCancel,
  onConfirm
}: LeaveCommunityConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="确认退出社区"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-xs rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-4 break-words text-base text-text">
          确定要退出「{communityName}」吗？退出后首页将不再显示这个社区的帖子。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text hover:bg-bg"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl border border-danger bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            确认退出
          </button>
        </div>
      </div>
    </div>
  );
}
