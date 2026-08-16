import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface PublishActionSheetProps {
  onClose: () => void;
}

interface PublishOption {
  key: string;
  emoji: string;
  label: string;
  to: string;
}

const RENT_OPTION: PublishOption = { key: "rent", emoji: "🏠", label: "发布租房", to: "/publish?category=rent" };
const WANTED_OPTION: PublishOption = { key: "wanted", emoji: "🔑", label: "发布求租", to: "/publish?category=wanted" };
const USED_OPTION: PublishOption = { key: "used", emoji: "🛍️", label: "发布二手", to: "/publish?category=used" };
const ACTIVITY_OPTION: PublishOption = { key: "activity", emoji: "👥", label: "发起搭子", to: "/activities/new" };

const DEFAULT_OPTIONS: PublishOption[] = [RENT_OPTION, WANTED_OPTION, USED_OPTION, ACTIVITY_OPTION];

/**
 * "找搭子"相关页面（/activities 开头）点开发布入口时，把"发起搭子"排到
 * 第一位、并加一层视觉强调（粗体 + 淡蓝底），而不是跟房源/二手这些不相关
 * 选项同等排列——用户本来就在找搭子页面点发布，大概率就是想发活动，不该
 * 为了选中它而多扫一遍其它三个选项。
 */
function getOrderedOptions(pathname: string): {
  options: PublishOption[];
  emphasizedKey: string | null;
} {
  if (pathname === "/activities" || pathname.startsWith("/activities/")) {
    return {
      options: [ACTIVITY_OPTION, RENT_OPTION, WANTED_OPTION, USED_OPTION],
      emphasizedKey: ACTIVITY_OPTION.key
    };
  }
  return { options: DEFAULT_OPTIONS, emphasizedKey: null };
}

/**
 * 全局发布入口的 Action Sheet：由 AppHeader 右上角的"发布"按钮触发，选完
 * 直接跳转到对应发布页，不在这里做登录态判断——目标路由（/publish、
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
 * 背景点击关闭 + 锁 body 滚动"的模式，不新增一个通用弹层组件。
 */
export function PublishActionSheet({ onClose }: PublishActionSheetProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const { options, emphasizedKey } = getOrderedOptions(location.pathname);

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
        className="w-full rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm font-medium text-text-muted">选择发布类型</p>
        <ul className="flex flex-col gap-2">
          {options.map((option) => {
            const emphasized = option.key === emphasizedKey;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base ${
                    emphasized
                      ? "bg-primary/10 font-semibold text-primary"
                      : "bg-bg text-text"
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
