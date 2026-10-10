import { ChevronRight, PlusCircle, Users, X } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface AppMenuDrawerProps {
  onClose: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  description: string;
  to: string;
  Icon: typeof Users;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: "my-communities",
    label: "我的社区",
    description: "查看已加入的社区",
    // 社区浏览页支持 ?tab= 参数，直接打开"我的社区"Tab。
    to: "/community?tab=mine",
    Icon: Users
  },
  {
    key: "create-community",
    label: "创建社区",
    description: "提交申请，管理员审核通过后上线",
    // 需要登录：未登录会被 /community/create 路由上的 RequireAuth 挡回登录页。
    to: "/community/create",
    Icon: PlusCircle
  }
];

/**
 * 首页左上角"三条横线"打开的侧边菜单（参照 Facebook）：从左侧滑出，盖住屏幕
 * 约 80% 宽，点遮罩 / 关闭按钮 / Esc 关闭，选一项后先关菜单再跳转。
 *
 * 结构照抄 publish-action-sheet.tsx 的写法（这个仓库没有通用 Dialog/Drawer
 * 组件）：role="dialog"、Esc 关闭、打开期间锁住 body 滚动；只是形状从底部弹层
 * 换成左侧抽屉。
 *
 * 这一版只有两项："我的社区"、"创建社区"。菜单项写成数组，以后加入口只加一行。
 */
export function AppMenuDrawer({ onClose }: AppMenuDrawerProps) {
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

  function handleSelect(item: MenuItem): void {
    onClose();
    navigate(item.to);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="菜单"
      className="fixed inset-0 z-30 bg-overlay"
      onClick={onClose}
    >
      <nav
        aria-label="菜单选项"
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-4/5 max-w-xs flex-col bg-card pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-card"
      >
        <div className="flex h-14 items-center justify-between px-4">
          <span className="text-lg font-bold text-primary">Saminest</span>
          <button
            type="button"
            aria-label="关闭菜单"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-text"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <ul className="flex flex-col gap-1 px-2">
          {MENU_ITEMS.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => handleSelect(item)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-bg"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                  <item.Icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-text">{item.label}</span>
                  <span className="block text-xs text-text-muted">{item.description}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-chevron" />
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
