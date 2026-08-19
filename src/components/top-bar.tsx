import { ArrowLeft, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * 全站统一顶部栏——Meet5 风格改版任务卡 01（见
 * docs/saminest_codex_reference_pack/design-reference/01-design-tokens-nav.md）
 * 的核心产出，02～06 号页面卡都要在自己的页面里渲染这个组件，不再各写
 * 各的顶部栏。
 *
 * 用一个 variant 判别式联合类型表达 5 种规则表里的顶部栏形态（见
 * 00-overview.md"顶部栏规则速查"），而不是一个"所有字段都是可选"的大
 * 通用 props——不同变体需要的信息本来就不一样（首页要州名+两个固定图标，
 * detail 要返回+可选更多菜单，create 要关闭+发布按钮…），用判别式联合让
 * TypeScript 在调用点就能强制"选了这个 variant 就必须传对应的必填 prop"，
 * 不是运行时才发现漏传。
 *
 * 组件本身不认识"品牌名""发布按钮"这些具体业务概念——只有 home 变体会
 * 渲染"Saminest"文案，其余变体的标题/图标/菜单内容都由调用方传入，从源头
 * 保证"除首页外不出现品牌名/发布按钮"这条规则不会被后续开发者不小心
 * 破坏（不需要每个页面自己记得"别加品牌名"，因为组件里压根没有别的地方
 * 能加）。
 *
 * 返回/关闭按钮默认用 navigate(-1)，调用方传了 onBack/onClose 就用调用方
 * 的——大多数二级页直接用默认值就够（跟 app-header.tsx 现有的返回按钮是
 * 同一个默认行为），只有像 conversation-page.tsx 那种"直接从外部链接进来、
 * 历史栈里没有上一页"要做特殊兜底跳转的页面才需要自己传 onBack。
 *
 * 每个变体渲染的标题（tab 的居中大标题、detail/create/nav-only 的居中
 * 小标题）都已经是这个页面的 <h1>——迁移到这个组件的页面注意删掉自己原来
 * 手写的 <h1>，不要让页面里同时出现两个 <h1>。
 *
 * 页面结构固定三段（左/中/右），空白一侧用等宽的隐形占位块（EmptySlot）
 * 撑住宽度，不是简单地不渲染——否则标题会因为两侧宽度不对称而偏离真正的
 * 页面中心，跟 saminest_final_screens.html 参考稿里 .side.ghost（占位但
 * 透明）是同一个做法。
 */

const ICON_BUTTON_CLASS_NAME =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-text";

function EmptySlot() {
  return <span aria-hidden="true" className="w-9 shrink-0" />;
}

function BackButton({ onBack }: { onBack?: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label="返回"
      onClick={onBack ?? (() => navigate(-1))}
      className={ICON_BUTTON_CLASS_NAME}
    >
      <ArrowLeft size={18} aria-hidden="true" />
    </button>
  );
}

interface MoreMenuButtonProps {
  label: string;
  content: ReactNode;
}

/**
 * detail 变体的"…"更多菜单——这个仓库没有通用的 Dialog/弹层组件（见
 * publish-action-sheet.tsx 顶部注释），这里延续同一个"本地 state + Esc/
 * 点击外部关闭"的模式，只是形状是右上角锚定的小弹层，不是全屏 Sheet，
 * 所以不锁 body 滚动（挡住的内容面积太小，锁滚动反而显得突兀）。
 *
 * 菜单内容点击后统一收起：外层容器上挂一个 onClick 收起菜单，调用方传入
 * 的每一项（收藏/分享/举报…）自己的 onClick 会先于这个收起逻辑触发（React
 * 事件冒泡顺序），点完自动关闭菜单，不需要调用方自己记得关闭。
 */
function MoreMenuButton({ label, content }: MoreMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={ICON_BUTTON_CLASS_NAME}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 top-11 z-20 min-w-[132px] overflow-hidden rounded-xl bg-card py-1 shadow-lg"
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}

interface TopBarHomeProps {
  variant: "home";
  /** 胶囊按钮第二行展示的地区文案（08 号卡改版，取代原来单行的
   *  "{州名} · Saminest"）——没有选中地区时传 null，这一行显示占位文案
   *  「选择地区」，不是留空/不渲染这一行：08 号卡明确要求"未选择地区时
   *  这一行显示占位文案"，胶囊本身的两行结构、可点击范围都不因为有没有
   *  选中地区而变化，只有第二行的文字内容不同。具体传什么字符串由调用方
   *  决定（首页目前是"有城市数据就显示 {城市名}, {州代码}，否则显示
   *  {州全名}"，见 home-page.tsx），这个组件不关心地区数据从哪来。 */
  regionLabel: string | null;
  /** 点击整个胶囊按钮跳转"地区选择"页——08 号卡改版前只有州名那一小段文字
   *  可点，现在整个胶囊（含"Saminest"那一行）都是同一个点击目标，理由是
   *  两行文字本来就是一个不可拆分的视觉整体（同一个按钮），没必要让用户
   *  必须精确点中第二行才能触发跳转。 */
  onRegionClick: () => void;
  /** 右侧"＋"图标点击——首页点它弹出"选择发布类型"弹层（⑨），具体弹层
   *  由调用方决定，这个组件只负责暴露点击事件。（这条注释原来误写成"左边"，
   *  顺手改成跟实际渲染位置一致的"右侧"，跟这次改动本身无关。） */
  onCreateClick: () => void;
  onSearchClick: () => void;
}

interface TopBarTabProps {
  variant: "tab";
  title: string;
  /** 右侧场景化图标（消息=🔔、我的=⚙️、找搭子=筛选…），不传就是空
   *  （分类页）——TopBar 不认识这些具体场景，只负责摆放调用方给的图标。 */
  right?: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
  };
}

interface TopBarDetailProps {
  variant: "detail";
  title?: string;
  onBack?: () => void;
  /** "…"更多菜单里的内容（收藏/分享/举报之类），调用方传什么就摆什么。
   *  不传就完全不渲染"…"按钮——没有可点的内容还留一个空按钮没有意义。 */
  moreMenu?: {
    label: string;
    content: ReactNode;
  };
}

interface TopBarCreateProps {
  variant: "create";
  title: string;
  onClose?: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
}

interface TopBarNavOnlyProps {
  variant: "nav-only";
  title: string;
  onBack?: () => void;
}

export type TopBarProps =
  | TopBarHomeProps
  | TopBarTabProps
  | TopBarDetailProps
  | TopBarCreateProps
  | TopBarNavOnlyProps;

export function TopBar(props: TopBarProps) {
  const navigate = useNavigate();

  if (props.variant === "home") {
    return (
      <header className="flex h-14 items-center justify-between px-4">
        {/* 08 号卡改版：从"州名 · Saminest 单行文字"换成 Meet5 风格的独立
            圆角胶囊按钮，内部纵向堆叠两行——第一行品牌名（加粗蓝字），第二行
            当前选中的地区（小字、次要文字色，未选择时是占位文案）。整个胶囊
            都是一个可点击的 <button>，不是只有地区那一小行可点——见上面
            onRegionClick 的注释。 */}
        <button
          type="button"
          onClick={props.onRegionClick}
          className="flex shrink-0 flex-col items-start rounded-full border border-border bg-card px-3 py-1.5 text-left"
        >
          <span className="text-base font-bold leading-tight text-primary">Saminest</span>
          <span className="text-xs font-medium leading-tight text-text-muted">
            {props.regionLabel ?? "选择地区"}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="发布"
            onClick={props.onCreateClick}
            className={ICON_BUTTON_CLASS_NAME}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="搜索"
            onClick={props.onSearchClick}
            className={ICON_BUTTON_CLASS_NAME}
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </div>
      </header>
    );
  }

  if (props.variant === "tab") {
    return (
      <header className="flex h-14 items-center justify-between px-4">
        <EmptySlot />
        <h1 className="flex-1 truncate text-center text-xl font-bold text-text">{props.title}</h1>
        {props.right ? (
          <button
            type="button"
            aria-label={props.right.label}
            onClick={props.right.onClick}
            className={ICON_BUTTON_CLASS_NAME}
          >
            {props.right.icon}
          </button>
        ) : (
          <EmptySlot />
        )}
      </header>
    );
  }

  if (props.variant === "detail") {
    return (
      <header className="flex h-14 items-center justify-between px-4">
        <BackButton onBack={props.onBack} />
        {props.title ? (
          <h1 className="flex-1 truncate text-center text-base font-bold text-text">
            {props.title}
          </h1>
        ) : (
          <span className="flex-1" />
        )}
        {props.moreMenu ? (
          <MoreMenuButton label={props.moreMenu.label} content={props.moreMenu.content} />
        ) : (
          <EmptySlot />
        )}
      </header>
    );
  }

  if (props.variant === "create") {
    return (
      <header className="flex h-14 items-center justify-between px-4">
        <button
          type="button"
          aria-label="关闭"
          onClick={props.onClose ?? (() => navigate(-1))}
          className={ICON_BUTTON_CLASS_NAME}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <h1 className="flex-1 truncate text-center text-base font-bold text-text">
          {props.title}
        </h1>
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={props.submitDisabled}
          className="shrink-0 px-1 text-base font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {props.submitLabel ?? "发布"}
        </button>
      </header>
    );
  }

  // variant === "nav-only"
  return (
    <header className="flex h-14 items-center justify-between px-4">
      <BackButton onBack={props.onBack} />
      <h1 className="flex-1 truncate text-center text-base font-bold text-text">{props.title}</h1>
      <EmptySlot />
    </header>
  );
}
