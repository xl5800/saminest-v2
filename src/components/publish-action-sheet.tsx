import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export interface PublishActionSheetProps {
  onClose: () => void;
}

interface PublishOption {
  key: string;
  emoji: string;
  label: string;
  to: string;
}

/**
 * 固定顺序 + 固定高亮（05-publish-flow.md 5.1）：「发起搭子」永远排第一、
 * 永远是浅蓝底高亮项，跟点开这个弹层之前用户在哪个页面无关——这个弹层
 * 现在只有一个入口（首页顶部「＋」，见 home-page.tsx），不再是"找搭子
 * 页面打开时顺带把发起搭子排前面"这种按路径变化的场景，所以不需要也不应该
 * 再按 pathname 重新排序/加粗，那是这次改版之前的旧逻辑。
 */
const OPTIONS: PublishOption[] = [
  { key: "activity", emoji: "🤝", label: "发起搭子", to: "/activities/new" },
  { key: "rent", emoji: "🏠", label: "发布租房", to: "/publish?category=rent" },
  { key: "wanted", emoji: "🔑", label: "发布求租", to: "/publish?category=wanted" },
  { key: "used", emoji: "🛍", label: "发布二手", to: "/publish?category=used" }
];

const EMPHASIZED_KEY = OPTIONS[0].key;

/**
 * 首页顶部「＋」触发的"选择发布类型"半屏弹层（05-publish-flow.md 5.1）。
 * 选完直接跳转到对应表单，不在这里做登录态判断——目标路由（/publish、
 * /activities/new）都已经在 routes.tsx 用 RequireAuth 包裹，未登录点选项
 * 会被路由层重定向到 /login，这里只负责导航，符合 CLAUDE.md"不在页面/
 * 组件内部单独判断登录状态"的统一规则。
 *
 * 发布租房/求租/二手这三项目前指向同一个 PublishPage（项目里发帖只有一张
 * posts 表 + category_id 区分类型，没有三个独立的发布页面），用
 * `?category=<slug>` 带上要预选的分类，PublishPage 挂载时按 slug 查表单
 * 分类下拉的初始值（见 publish-page.tsx 的 presetCategorySlug 处理）——
 * 不新建三个几乎一样的发布页面，那是不必要的重复。
 *
 * 这个仓库没有专门的 Dialog/Modal 组件，沿用 image-lightbox.tsx /
 * my-posts-page.tsx 删除确认弹窗同一个"fixed inset-0 + 本地 state + Esc/
 * 背景点击关闭 + 锁 body 滚动"的模式，不新增一个通用弹层组件；遮罩色沿用
 * 这几处已有的 bg-black/40，跟设计稿字面的 rgba(17,24,39,0.4) 数值上有
 * 细微差别（纯黑 vs 深灰蓝黑），但全站弹层遮罩目前都是这一个值，为了这一
 * 处弹层单独引入一个新的一次性遮罩色数值，反而违反 01 号卡"不再出现散落
 * 色值"的初衷。
 */
export function PublishActionSheet({ onClose }: PublishActionSheetProps) {
  const navigate = useNavigate();

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

  function handleSelect(option: PublishOption): void {
    onClose();
    navigate(option.to);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="选择发布类型"
      className="fixed inset-0 z-20 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-profile-card bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm font-medium text-text-muted">选择发布类型</p>
        <ul className="flex flex-col gap-2">
          {OPTIONS.map((option) => {
            const emphasized = option.key === EMPHASIZED_KEY;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-semibold ${
                    emphasized ? "bg-primary-light text-primary" : "bg-bg text-text"
                  }`}
                >
                  <span aria-hidden="true" className="text-xl">
                    {option.emoji}
                  </span>
                  {option.label}
                </button>
              </li>
            );
          })}
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
