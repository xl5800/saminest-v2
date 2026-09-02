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
      <header className="flex h-14 items-center justify-between px-4">
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
              className={ICON_BUTTON_CLASS_NAME}
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
    </header>
  );
}
