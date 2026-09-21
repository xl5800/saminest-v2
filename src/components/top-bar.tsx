import { ArrowLeft, ChevronDown, MoreHorizontal, Plus, Search, X } from "lucide-react";
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
 * 保证"除非显式选用 home 变体，不会出现品牌名胶囊"这条规则不会被后续
 * 开发者不小心破坏（不需要每个页面自己记得"别加品牌名"，因为组件里压根
 * 没有别的地方能加）。14 号卡起 home 变体不再只有首页一个调用点——找搭子
 * 列表页视觉改版要求同一个"Saminest + 当前地区"胶囊，产品明确要求"跟首页
 * 那个按钮完全一致"，所以直接复用同一个 variant（而不是照着截图新建一个
 * 几乎一样的变体），只是找搭子列表页不需要"＋发布"入口——onCreateClick
 * 因此改成可选，不传时不渲染那个图标按钮，"＋"和"搜索"两个图标不再必然
 * 成对出现。
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

/**
 * 顶栏+分类 Chips 固定成一张卡片任务卡：五个 variant 各自的最外层
 * `<header>` 现在统一套上这一份"固定卡片"处理，不再是普通的、随内容一起
 * 滚动走的一段 flex 行——BARRY 已经确认过效果图，四个角都不要圆角（这几个
 * `<header>` 本来就没有设过 rounded-*，不用额外清零）。
 *
 * `sticky`（不是 `fixed`）：整站没有给 `<main>` 单独包一层可滚动容器，
 * 滚动的一直是 `body`/视口本身（`bottom-nav.tsx` 用 `fixed` 是因为它是
 * `AppShell` 在页面外层单独渲染的常驻元素，不在任何页面自己的文档流里，
 * 需要自己占住底部；这个组件是每个页面 `<main>` 内部的第一个子元素，
 * 用 `sticky` 能让它自动在文档流里占住自己的高度，下面的内容天然从它
 * 下边界开始排布，不需要每个页面自己再手动算一个 padding-top 去让开
 * 顶栏——首页这次还要在顶栏下面追加不定高的分类 Chips/搜索框，如果改用
 * `fixed` 就必须由每个页面自己精确算出当前顶栏总高度当 padding-top，
 * 首页那个高度还会随搜索框开合变化，`sticky` 完全不需要关心这些）。
 * `z-10` 跟 `bottom-nav.tsx`/（未使用的）`app-header.tsx` 这两个"常驻
 * chrome"用的层级一致，仍然低于 Modal/BottomSheet/Lightbox 这类真正需要
 * 盖住一切的浮层（`z-20`/`z-30`，见 `publish-action-sheet.tsx`/
 * `image-lightbox.tsx`）。
 *
 * 状态栏区域：`body` 上有全站通用的 `padding-top: env(safe-area-inset-top)`
 * 把包括这个顶栏在内的所有内容往下推开状态栏——这次不能动这条全局规则
 * （"我的"页、还没迁移到 TopBar 的旧页面都还依赖它），所以只在这个组件
 * 自己身上局部抵消：`-mt-[env(safe-area-inset-top)]` 把顶栏自己"拉"回
 * 真正的屏幕顶端（背景/描边因此能铺满状态栏那段区域，不会露出一条
 * `body` 背景色的缝），再用 `pt-[env(safe-area-inset-top)]` 把顶栏内部
 * 真正的文字/按钮内容重新推回状态栏下面——两者数值相等、方向相反，净效果
 * 是"卡片顶到屏幕最顶边，卡片里的内容位置跟改之前视觉上完全一样"。
 * 内部这层 `h-14 flex ...` 保留在一个独立的 `<div>` 里而不是直接放在
 * `<header>` 上：`<header>` 现在的高度要跟随 `padding-top` 动态变化
 * （状态栏高度 + 这一行的高度），如果 `h-14` 这个固定高度直接套在
 * `<header>` 上，加上 `padding-top` 之后（Tailwind Preflight 全局
 * `box-sizing: border-box`）会把状态栏的高度也算进这固定的 56px 里，
 * 把内容行反而挤扁。
 */
const STICKY_CARD_CLASS_NAME =
  "sticky top-0 z-10 -mt-[env(safe-area-inset-top)] border-b border-topbar-line bg-bg-secondary pt-[env(safe-area-inset-top)]";
const HEADER_ROW_CLASS_NAME = "flex h-14 items-center justify-between px-4";

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
  /** 地区按钮展示的文案（08 号卡改版，取代原来单行的"{州名} · Saminest"；
   *  顶部栏拆分任务卡起，这一列文字展示在独立的地区按钮上，不再是品牌名
   *  胶囊的第二行）——没有选中地区时传 null，按钮显示占位文案「选择地区」，
   *  不是留空/不渲染：08 号卡明确要求"未选择地区时显示占位文案"，这条
   *  行为拆分之后没有变化，只是承载它的元素从"胶囊第二行"变成了"独立
   *  按钮的文字"。具体传什么字符串由调用方决定（首页目前是"有城市数据就
   *  显示 {城市名}, {州代码}，否则显示 {州全名}"，见 home-page.tsx），
   *  这个组件不关心地区数据从哪来。 */
  regionLabel: string | null;
  /** 点击地区按钮跳转"地区选择"页——顶部栏拆分任务卡之前，这个点击事件挂
   *  在"Saminest + 地区"合并成的整个胶囊按钮上（含品牌名那一行）；拆分之后
   *  品牌名"Saminest"变成纯文字、不可点击，只有这个独立的地区按钮才响应
   *  点击，行为（跳转地区选择页）本身没有变化，变的只是"点哪里能触发"这个
   *  可点击范围。 */
  onRegionClick: () => void;
  /** 右侧"＋"图标点击——首页点它弹出"选择发布类型"弹层（⑨），具体弹层
   *  由调用方决定，这个组件只负责暴露点击事件。（这条注释原来误写成"左边"，
   *  顺手改成跟实际渲染位置一致的"右侧"，跟这次改动本身无关。） */
  onCreateClick?: () => void;
  onSearchClick: () => void;
  /** 顶栏+分类 Chips 固定成一张卡片任务卡新增——只有首页需要在固定卡片
   *  里，紧跟着品牌名那一行，再追加渲染分类 Chips（以及搜索框展开时的
   *  搜索输入框），让它们和顶栏合并成同一张卡片，卡片底部的分隔线只出现
   *  在这一整块的最下面，不会在顶栏和分类 Chips 之间多出一条线。不传就
   *  是原来的样子（只有品牌名那一行），其它 variant 完全没有这个 prop——
   *  `TopBar` 本身不因为这次改动而变得"必须配合外层容器才能正确显示"，
   *  其它没有分类 Chips 的页面（包括复用 home 变体的找搭子列表页）不用
   *  改自己的调用代码。 */
  bottomSlot?: ReactNode;
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
  /** 不传就是纯返回箭头，不展示任何标题文字——21 号卡（二级页面顶部栏
   *  简化）新增的用法："我的活动"/"我的收藏"/帖子详情页这类二级页面本来
   *  就有自己的页面内大标题（或者像帖子详情页那样标题就是内容本身），
   *  顶部栏不需要再重复一遍标题，只留一个返回箭头。地区选择页这种确实
   *  需要顶部栏标题的场景继续传 title 就行，不用改调用点代码。 */
  title?: string;
  onBack?: () => void;
  /** 26 号卡新增：右侧可选的单个图标按钮，形状照抄 TopBarTabProps.right——
   *  只有 /my-posts 这一个调用点需要（返回箭头+标题之外，右上角还要放一个
   *  "发布"入口）。不传就是 tab 变体同款的隐形占位块（EmptySlot），不是
   *  detail 变体那种多项菜单（moreMenu 是弹出的菜单列表，形状跟"一个能
   *  直接点击的图标按钮"不一样，这里不复用 moreMenu），也不新增一个专门
   *  的 variant——这是本次任务卡权衡下来改动最小、其它 nav-only 调用点
   *  行为完全不受影响的方案。 */
  right?: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
  };
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
      <header className={STICKY_CARD_CLASS_NAME}>
        <div className={HEADER_ROW_CLASS_NAME}>
          {/* 顶部栏拆分任务卡：08 号卡把"州名 · Saminest 单行文字"合并成一个
              两行堆叠的圆角胶囊按钮（品牌名+地区都在同一个 <button> 里）；这次
              按产品确认过的找搭子列表页 mockup 拆回三个独立元素——品牌名是
              纯文字 <span>，不再可点击；地区是它自己独立的圆角按钮（保留
              onRegionClick 行为和"选择地区"占位文案不变，新增一个下拉箭头
              图标暗示"这是可点选项"）；最右侧的"＋"发布/搜索图标完全不变，
              只是不再跟品牌名共享同一个 flex 容器，各自在自己的分组里，见下面
              两个 <div>。 */}
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <span className="shrink-0 text-base font-bold leading-tight text-primary">
              Saminest
            </span>
            <button
              type="button"
              onClick={props.onRegionClick}
              className="flex min-w-0 shrink-0 items-center gap-0.5 rounded-full border border-border bg-card px-3 py-1.5 text-left"
            >
              <span className="truncate text-xs font-medium leading-tight text-text-muted">
                {props.regionLabel ?? "选择地区"}
              </span>
              <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {props.onCreateClick ? (
              <button
                type="button"
                aria-label="发布"
                onClick={props.onCreateClick}
                // 首页"＋发布"按钮改蓝色任务卡：只有这一个按钮单独换成
                // bg-primary + text-white，不改 ICON_BUTTON_CLASS_NAME 本身
                // （那个类还给返回/更多/搜索/关闭等其它图标按钮用，改了会
                // 导致全站图标按钮都变蓝）。尺寸/圆角/间距（h-9 w-9
                // rounded-full）照抄 ICON_BUTTON_CLASS_NAME，只换背景和
                // 图标颜色这两处。
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              aria-label="搜索"
              onClick={props.onSearchClick}
              className={ICON_BUTTON_CLASS_NAME}
            >
              <Search size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        {props.bottomSlot}
      </header>
    );
  }

  if (props.variant === "tab") {
    return (
      <header className={STICKY_CARD_CLASS_NAME}>
        <div className={HEADER_ROW_CLASS_NAME}>
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
        </div>
      </header>
    );
  }

  if (props.variant === "detail") {
    return (
      <header className={STICKY_CARD_CLASS_NAME}>
        <div className={HEADER_ROW_CLASS_NAME}>
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
        </div>
      </header>
    );
  }

  if (props.variant === "create") {
    return (
      <header className={STICKY_CARD_CLASS_NAME}>
        <div className={HEADER_ROW_CLASS_NAME}>
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
        </div>
      </header>
    );
  }

  // variant === "nav-only"
  return (
    <header className={STICKY_CARD_CLASS_NAME}>
      <div className={HEADER_ROW_CLASS_NAME}>
        <BackButton onBack={props.onBack} />
        {props.title ? (
          <h1 className="flex-1 truncate text-center text-base font-bold text-text">
            {props.title}
          </h1>
        ) : (
          <span className="flex-1" />
        )}
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
      </div>
    </header>
  );
}
