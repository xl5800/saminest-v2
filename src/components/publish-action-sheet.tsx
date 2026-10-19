import {
  Gift,
  Handshake,
  Home,
  type LucideIcon,
  Megaphone,
  MessageSquareText,
  Search,
  ShoppingBag,
  UserRoundSearch,
  X
} from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { formatShortRegionLabel } from "../data/us-states";
import { useSelectedRegionStore } from "../store/selected-region-store";

export interface PublishActionSheetProps {
  onClose: () => void;
}

interface PublishOption {
  key: string;
  Icon: LucideIcon;
  label: string;
  to: string;
}

/**
 * 固定顺序 + 固定高亮（05-publish-flow.md 5.1）：第一项永远是浅蓝底高亮项，
 * 跟点开这个弹层之前用户在哪个页面无关。
 */
// 产品决策更新：固定第一项 + 固定高亮改成了「发布社区帖子」，不再是「发起搭子」。
// 首页图标入口改版：选项从 emoji + 竖排列表改成线性图标的四列网格（两行），
// 第一项"社区帖子"是蓝色实心图标；文字去掉"发布"两个字（标题已经是"发布到…"），
// 出租写成"房屋出租"，二手写成"二手闲置"，跟首页入口的叫法一致。
const OPTIONS: PublishOption[] = [
  { key: "community", Icon: MessageSquareText, label: "社区帖子", to: "/community/new" },
  // 招聘求职任务卡：首页第一个入口是招聘求职，发布入口紧跟社区帖子。
  { key: "hiring", Icon: Megaphone, label: "招聘", to: "/publish?category=hiring" },
  { key: "job-seeking", Icon: UserRoundSearch, label: "求职", to: "/publish?category=job-seeking" },
  { key: "rent", Icon: Home, label: "房屋出租", to: "/publish?category=rent" },
  { key: "wanted", Icon: Search, label: "求租", to: "/publish?category=wanted" },
  { key: "used", Icon: ShoppingBag, label: "二手闲置", to: "/publish?category=used" },
  // 免费物品任务卡
  { key: "free", Icon: Gift, label: "免费送", to: "/publish?category=free" },
  { key: "activity", Icon: Handshake, label: "找搭子", to: "/activities/new" }
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
  const selectedRegion = useSelectedRegionStore((s) => s.selectedRegion);
  const title = selectedRegion ? `发布到${formatShortRegionLabel(selectedRegion)}` : "选择发布类型";

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
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border" />
        <h2 className="mb-4 px-1 text-lg font-bold text-primary">{title}</h2>
        <ul className="grid grid-cols-4 gap-y-4">
          {OPTIONS.map((option) => {
            const emphasized = option.key === EMPHASIZED_KEY;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => handleSelect(option)}
                  className="flex w-full flex-col items-center gap-1.5 text-[13px] text-text"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      emphasized ? "bg-primary text-white" : "bg-primary-light text-primary"
                    }`}
                  >
                    <option.Icon aria-hidden="true" size={26} />
                  </span>
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="mx-auto mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-field text-text"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>
    </div>
  );
}
