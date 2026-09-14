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
 * 背景点击关闭 + 锁 body 滚动"的模式，不新增一个通用弹层组件。
 *
 * 全 App 视觉 Token 体系（第二批）：遮罩色从硬编码的 `bg-black/40`（上面
 * 这段历史注释里"为了不引入一次性色值所以沿用 bg-black/40"的理由这次不
 * 再成立——第一批已经专门为这个场景建好了 `--color-overlay`
 * （`bg-overlay`，rgba(20,26,38,0.45)，比纯黑更柔和），这次就是要把这类
 * 散落的遮罩色统一到这个 token 上，不是繼續新增散落色值，换成 `bg-overlay`
 * 正是这批任务卡的目的。弹层圆角同理从借用的 `rounded-t-profile-card`
 * （20px，本来是"我的"页头像卡片专用的 token，这里只是凑巧数值相近就
 * 拿来用）换成 index.css 圆角表里明确写好的"Modal/BottomSheet 24px"这一档
 * （Tailwind 默认 `rounded-t-3xl`，不需要新建 token）。
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
      className="fixed inset-0 z-20 flex items-end bg-overlay"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
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
