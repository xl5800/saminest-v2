import { Crown, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import type { ActivityParticipant } from "../repositories/activities-repository";
import { formatActivityParticipantSummary } from "../utils/format";

/**
 * 07 号卡（活动卡片头像区放大 + 发起者联系参与者）：头像堆叠统一放大成
 * Meet5 风格的大号、不叠放网格布局——活动列表卡片和活动详情页的参与者
 * 头像行共用同一套规则（任务卡原话"两处共用同一套规则"），不再像改版前
 * 那样靠 maxVisibleSlots 这个 prop 各自传一个不同的数字定制列表/详情两种
 * 场景。视觉位置总数固定最多 8 个（发起人+参与者+空位/溢出徽标合计），用
 * 下面两个常量取代原来的 MAX_VISIBLE_SLOTS 常量 + maxVisibleSlots prop。
 *
 * 14 号卡（找搭子页改版：顶部栏 + 活动卡片头像展示）在此基础上让"共用同一
 * 套规则"这句话出现了一个例外：活动卡片的头像形状从圆形叠加改成正方形
 * 拼图，详情页维持圆形不变——"8 个视觉位置"这套 slot 计算规则（下面的
 * computeSlots）两处仍然完全共用，只有形状（shape prop）和"要不要在超过
 * 8 人时展示'+N'溢出徽标"（allowOverflowBadge）这两点按场景分叉，避免为
 * 了一个纯视觉差异把 slot 计算逻辑拆成两份重复代码。
 *
 * 17 号卡（找搭子详情页头像改版：方块化 + 圆角 + 显示全部参与者）：
 * 详情页头像格形状从圆形换成跟活动卡片一样的正方形拼图（shape="square"，
 * 详情页调用点显式传），同时给正方形格子加了一圈小圆角（见下面
 * SQUARE_AVATAR_TILE_CLASS_NAME / SQUARE_EMPTY_SLOT_CLASS_NAME 的
 * rounded-md）——这一圈圆角是共享样式，活动卡片跟详情页头像会同时跟着变
 * 圆角，这是任务卡明确要的效果，不是只改详情页那一份。另外详情页不应该再
 * 像圆形版本那样"超过 8 人就截断成 7 个 + '+N' 徽标"，而是要不封顶展示全部
 * 参与者——computeSlots 的 allowOverflowBadge 布尔值因此升级成三态的
 * overflowStrategy（"badge" | "cap" | "showAll"），新增的 "showAll" 只
 * 影响原来的规则 3（溢出）分支，规则 1/2（capacity 封顶 / 补空位到 8）逐字
 * 不变；组件新增 showAllParticipants prop 驱动这一支，默认 false，不影响
 * 活动卡片现有的 shape="square" + 封顶 8 个不做 "+N" 这条行为（卡片调用点
 * 没有传这个新 prop）。 */
export const MAX_TOTAL_SLOTS = 8;
/**
 * 真实头像（发起人+参与者）数量超过这个数字才会出现"+N"溢出徽标——比
 * MAX_TOTAL_SLOTS 少 1，因为溢出徽标本身要占用最后一个视觉位置。
 */
const MAX_REAL_AVATARS_BEFORE_OVERFLOW = MAX_TOTAL_SLOTS - 1;

// 64px（07 号卡"头像直径 48px → 64px"）。同时喂给头像/空位/溢出徽标三种
// 格子，保持网格里三种格子对齐。
const AVATAR_SIZE_CLASS_NAME = "h-16 w-16";
// 2px 白色描边（ring-2 ring-card，07 号卡从 2.5px 收窄到 2px），投影维持
// 不变（任务卡原话"shadow 保持不变"）。改版前头像靠 -space-x-3 叠放，描边
// 是让相邻头像分得开的关键；现在头像已经用正常网格间距摆开、不再叠放，但
// 任务卡明确要求保留这圈描边，这里没有顺手去掉。ring-card 而不是
// ring-white：跟 --card token 保持同一个语义来源（卡片背景色）。
const AVATAR_RING_CLASS_NAME = "ring-2 ring-card shadow-[0_1px_3px_rgba(0,0,0,0.12)]";
// 虚线描边颜色从原来跟随主题的 border-border 换成 07 号卡明确给出的具体
// 色值 #D1D5DB——正好是 Tailwind 内置的 border-gray-300（数值完全一致），
// 不是新引入一个硬编码颜色。
const EMPTY_SLOT_CLASS_NAME =
  "flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-card text-text-muted";
// 4 列固定宽度网格（每列 4rem = 64px，跟头像直径一致）+ 12px 间距。用显式
// grid-template-columns 定宽，而不是 flex-wrap：flex-wrap 只在容器宽度不
// 够时才换行，"每行几个"取决于容器宽度，没法保证 07 号卡"固定最多 4 个一
// 行"这个硬性要求；4 列定宽网格不管容器多宽，第 5 个格子永远自动换到第二
// 行，最多两行（8 个格子 / 每行 4 个）。
const AVATAR_GRID_CLASS_NAME = "grid grid-cols-[repeat(4,4rem)] gap-3";

/**
 * 14 号卡（找搭子页改版：顶部栏 + 活动卡片头像展示）：活动卡片（列表页）
 * 的头像从"圆形叠加"改成 Meet5 风格的"正方形拼图"——四列铺满卡片整宽、
 * 贴着卡片顶部和左右边缘（不留卡片自己的左右内边距），格子之间只留 2px
 * 缝隙透出卡片背景色当分隔线，不再是圆形+白色描边。活动详情页的头像行
 * （shape 默认 "round"）保持 07 号卡那套 64px 圆形网格完全不变——这次任务
 * 卡的原话是"活动卡片头像"，没有要求改详情页，所以两种形状都保留、用
 * shape prop 区分，不是把详情页也一起换掉。
 *
 * 列宽用 grid-cols-4（4 等分，跟随卡片实际宽度）而不是圆形版本那种固定
 * 4rem 列宽——"铺满整卡宽度"这条要求意味着格子大小必须跟着卡片宽度变，不能
 * 是一个固定像素值。gap-0.5（Tailwind 默认刻度里正好是 2px）就是任务卡
 * 明确要求的"格子间 2px 左右的缝隙"。
 */
const SQUARE_AVATAR_GRID_CLASS_NAME = "grid grid-cols-4 gap-0.5";
// 正方形格子本身：aspect-square 让高度跟着 grid-cols-4 算出来的动态宽度走，
// w-full 撑满所在格子（不能再用圆形版本那种固定 h-16 w-16）。故意不带
// ring/shadow——07 号卡那圈白色描边是圆形叠放时代用来分隔相邻头像的，现在
// 分隔线已经改成 gap-0.5 露出的卡片背景色，再叠一圈描边只会跟 2px 缝隙
// 重复、显得多余，任务卡原话"格子之间留 2px 左右的小缝隙（让卡片背景色
// 透出来当分隔线）"没有再提描边。
// 17 号卡：加一圈小圆角（rounded-md，Tailwind 里是 6px）——反馈原话"方块带
// 小圆角，不是接近全圆"，微信群头像那种"方块化 + 小圆角"的观感，不能大到
// 接近 rounded-full（那样就跟原来圆形版本没区别了）。这是共享样式，活动
// 卡片和详情页头像会同时跟着变圆角，两处都是预期效果。
const SQUARE_AVATAR_TILE_CLASS_NAME = "aspect-square w-full rounded-md object-cover";
// 空位：跟头像同尺寸的正方形、浅色底 + "+"，不再是虚线圆圈——任务卡原话
// "空位（还没人报名的位置）改成跟头像同尺寸的正方形，浅色底 + 一个'＋'，
// 不再用虚线圆圈"，所以这里没有沿用圆形版本 EMPTY_SLOT_CLASS_NAME 的
// border-dashed。17 号卡：同样加 rounded-md，跟真实头像格保持一致的圆角，
// 不然网格里空位格子和头像格子的角会长得不一样。
const SQUARE_EMPTY_SLOT_CLASS_NAME =
  "flex aspect-square w-full items-center justify-center rounded-md bg-bg text-text-muted";

export interface ActivityParticipantAvatarsProps {
  organizerId: string;
  organizerDisplayName: string;
  organizerAvatarUrl: string | null;
  /** 已经不包含发起人（活动发起人从不出现在 activity_participants 表里，
   *  见 activities-repository.ts 的 listActivityParticipants）。 */
  participants: ActivityParticipant[];
  capacity: number | null;
  /** 空位是否可交互（点击报名）、参与者头像是否可点击进入对方主页（07
   *  号卡 7.3）。默认 true，跟改版之前的活动详情页行为一致，那个调用点
   *  不用改代码。活动列表页会传 false——列表卡片整体是一个
   *  <Link to="/activities/:id">，如果空位/参与者头像仍然渲染成
   *  <button>/<a>，会产生"<a> 嵌套可交互元素"这种非法 HTML 结构（跟
   *  conversation-list-page.tsx 修过的"<a> 嵌套 <a>"是同一类问题）。
   *  interactive === false 时空位改渲染一个纯展示的 <span aria-hidden>，
   *  参与者头像也不再包一层 <Link>，不需要调用方传
   *  canTapEmptySlot/onTapEmptySlot——这两个 prop 因此也是可选的。 */
  interactive?: boolean;
  /** 当前用户能不能点空位报名——已经报名/申请中/被拒绝/未登录/活动未开放
   *  这几种情况都应该是 false，跟"参加活动"按钮是否可点完全同一份判断，
   *  由调用方（ActivityDetailPage）传入，这个组件自己不重新判断一遍。
   *  interactive === false 时不需要传（纯展示模式下这个 prop 不生效）。 */
  canTapEmptySlot?: boolean;
  onTapEmptySlot?: () => void;
  /** 14 号卡新增：头像格的形状——"round"（默认）是 07 号卡那套 64px 圆形
   *  网格；"square"是正方形拼图（带小圆角，见 SQUARE_AVATAR_TILE_CLASS_NAME）。
   *  14 号卡时只有活动卡片用 "square"，17 号卡把详情页也改成了 "square"，
   *  不传就还是 "round"。 */
  shape?: "round" | "square";
  /** 17 号卡新增：详情页专用——不封顶展示全部参与者（不截断、不出现
   *  "+N" 溢出徽标），并在头像格上方加一行"共 X 人参加"。默认 false，
   *  活动卡片调用点不传这个 prop，继续保留"封顶 8 个、不做 '+N'"的既有
   *  行为不变（见 computeSlots 的 overflowStrategy）。 */
  showAllParticipants?: boolean;
}

type Slot =
  | { type: "organizer" }
  | { type: "participant"; participant: ActivityParticipant }
  | { type: "empty" };

interface SlotAvatarProps {
  avatarUrl: string | null;
  initial: string;
  isOrganizer?: boolean;
  shape: "round" | "square";
}

/**
 * 单个头像格：有图用 <img>，没有就用昵称首字母占位——跟 conversation-page.tsx
 * 的 Avatar 组件是同一套展示逻辑。发起人角标（lucide-react 的 Crown）绝对
 * 定位在右下角，大约是头像的 1/3 大小——这是设计稿之外、参照 Meetup"发起人
 * 身份要显眼"原则主动加的，不是可选项；07 号卡把头像放大到 64px 时，角标
 * 也按同一比例从 16px 放大到 20px，图标本身从 10px 放大到 12px。
 *
 * 14 号卡：shape="square" 时整块头像格改成正方形拼图（活动卡片用），
 * 不再是圆形——没有 rounded-full，也不带圆形版本那圈 ring 描边（缝隙已经
 * 靠外层 grid 的 gap-0.5 露出背景色实现，见 SQUARE_AVATAR_GRID_CLASS_NAME
 * 的注释），角标本身的圆形徽章样式不受影响，两种形状共用同一个 Crown 角标。
 */
function SlotAvatar({ avatarUrl, initial, isOrganizer, shape }: SlotAvatarProps) {
  if (shape === "square") {
    return (
      <div className="relative">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className={SQUARE_AVATAR_TILE_CLASS_NAME} />
        ) : (
          <span
            aria-hidden="true"
            className={`flex ${SQUARE_AVATAR_TILE_CLASS_NAME} items-center justify-center bg-primary/10 text-sm font-semibold text-primary`}
          >
            {initial}
          </span>
        )}
        {isOrganizer ? (
          <span
            aria-hidden="true"
            className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white ring-2 ring-white"
          >
            <Crown size={12} />
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className={`${AVATAR_SIZE_CLASS_NAME} ${AVATAR_RING_CLASS_NAME} rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex ${AVATAR_SIZE_CLASS_NAME} ${AVATAR_RING_CLASS_NAME} items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary`}
        >
          {initial}
        </span>
      )}
      {isOrganizer ? (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white ring-2 ring-white"
        >
          <Crown size={12} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * 把发起人/参与者/空位/溢出徽标这四种视觉元素，按 07 号卡 7.1 给出的三条
 * 互斥规则，折算成一个"最多 8 个视觉位置"的 slots 数组 + 溢出数字。三条
 * 规则的分支顺序跟任务卡列出的顺序一致：
 *
 * 1. capacity 不为 null 且 ≤ 8：跟改版前逻辑一样（只是头像更大、不叠
 *    放）——展示 min(已加入人数, capacity) 个真实头像，剩下的名额补
 *    capacity - 已加入人数 个虚线空位，两者相加正好等于 capacity。
 * 2. capacity 为 null 或 > 8，且已加入人数（发起人+参与者）≤ 8：展示全部
 *    真实头像，用虚线空位补到总共 8 个——这只是"还有空位"的纯视觉提示，
 *    不是一个精确的剩余名额数字（capacity 本身可能远大于 8 或者不限）。
 * 3. capacity 为 null 或 > 8，且已加入人数 > 8：只展示前 7 个真实头像，
 *    第 8 个位置换成"+N"溢出徽标（N = 已加入人数 - 7），不展示任何虚线
 *    空位。
 *
 * 14 号卡：活动卡片（shape="square"）这次不做"超过 8 人"的特殊处理——任务
 * 卡原话"这批先不做'超过 8 人'的处理……先简单只显示前 8 个（不用报错也
 * 不用做特殊提示）"，所以 overflowStrategy="cap" 时第 3 条规则直接展示
 * 前 8 个真实头像（不是 7 个），不再挤出一个位置放"+N"徽标，overflowCount
 * 恒为 0。默认 "badge"，保留详情页原来（17 号卡之前）用的"+N"溢出徽标
 * 行为——这条规则只是任务卡对"活动卡片"这一种展示场景的要求，没有说要连带
 * 改掉详情页已经在用的"+N"提示。
 *
 * 17 号卡新增第三种取值 "showAll"：详情页要求"不封顶、展示全部参与者"，
 * 第 3 条规则在这个取值下直接原样返回全部 realEntries、不截断、
 * overflowCount 恒为 0——只新增了这一个分支，规则 1（capacity 封顶）和
 * 规则 2（补空位到 8）完全没有改动，跟"只管形状换成方块 + 去掉封顶显示
 * 全部，不改要不要画空位这件事本身"的任务卡要求对应。
 */
function computeSlots(
  participants: ActivityParticipant[],
  capacity: number | null,
  options: { overflowStrategy?: "badge" | "cap" | "showAll" } = {}
): { slots: Slot[]; overflowCount: number } {
  const { overflowStrategy = "badge" } = options;
  const joinedCount = 1 + participants.length;
  const realEntries: Slot[] = [
    { type: "organizer" },
    ...participants.map((participant): Slot => ({ type: "participant", participant }))
  ];

  const capacityIsSmall = capacity !== null && capacity <= MAX_TOTAL_SLOTS;

  if (capacityIsSmall) {
    const totalSlots = capacity as number;
    const realCount = Math.min(joinedCount, totalSlots);
    const emptyCount = Math.max(totalSlots - joinedCount, 0);
    return {
      slots: [
        ...realEntries.slice(0, realCount),
        ...Array.from({ length: emptyCount }, (): Slot => ({ type: "empty" }))
      ],
      overflowCount: 0
    };
  }

  if (joinedCount <= MAX_TOTAL_SLOTS) {
    const emptyCount = MAX_TOTAL_SLOTS - joinedCount;
    return {
      slots: [
        ...realEntries,
        ...Array.from({ length: emptyCount }, (): Slot => ({ type: "empty" }))
      ],
      overflowCount: 0
    };
  }

  if (overflowStrategy === "showAll") {
    return {
      slots: realEntries,
      overflowCount: 0
    };
  }

  if (overflowStrategy === "cap") {
    return {
      slots: realEntries.slice(0, MAX_TOTAL_SLOTS),
      overflowCount: 0
    };
  }

  return {
    slots: realEntries.slice(0, MAX_REAL_AVATARS_BEFORE_OVERFLOW),
    overflowCount: joinedCount - MAX_REAL_AVATARS_BEFORE_OVERFLOW
  };
}

/**
 * 活动详情页/活动列表页共用的头像堆叠——07 号卡把它从"48px 叠放"改成
 * "64px 网格平铺"，视觉位置规则见上面 computeSlots 的注释。
 *
 * 详情页（interactive 默认 true）的空位点击复用"参加活动"按钮的同一套
 * 状态/逻辑，见 ActivityDetailPage 里 useActivityParticipationAction 的
 * 用法；参与者头像点击进入对方公开主页（07 号卡 7.3，复用现成的
 * /users/:userId 路由，不新建组件——任何用户的主页结构都一样，公开可见、
 * 非本人时带"发消息"按钮，发起人点参与者头像和参与者点发起人整行走的是
 * 同一套底层机制）。列表页（interactive={false}）的空位/参与者头像都是
 * 纯展示，不响应点击——见上面 interactive prop 的注释，这是"卡片整体是
 * <Link>"这个约束决定的。
 *
 * 发起人头像格本身不包链接——发起人已经有单独的整行可点击入口（详情页的
 * "发起人"卡片，04 号卡引入，07 号卡明确要求"发起人整行可点击进入发起者
 * 主页"这条行为不变），这里不重复、也不修改那个入口，只是把"点击头像进入
 * 主页"这个交互模式扩展给参与者头像。
 */
export function ActivityParticipantAvatars({
  organizerId,
  organizerDisplayName,
  organizerAvatarUrl,
  participants,
  capacity,
  interactive = true,
  canTapEmptySlot = false,
  onTapEmptySlot,
  shape = "round",
  showAllParticipants = false
}: ActivityParticipantAvatarsProps) {
  const isSquare = shape === "square";
  const joinedCount = 1 + participants.length;
  const overflowStrategy: "badge" | "cap" | "showAll" = showAllParticipants
    ? "showAll"
    : isSquare
      ? "cap"
      : "badge";
  const { slots, overflowCount } = computeSlots(participants, capacity, { overflowStrategy });
  const gridClassName = isSquare ? SQUARE_AVATAR_GRID_CLASS_NAME : AVATAR_GRID_CLASS_NAME;
  const emptySlotClassName = isSquare ? SQUARE_EMPTY_SLOT_CLASS_NAME : EMPTY_SLOT_CLASS_NAME;

  return (
    <div>
      {/* 17 号卡：只在详情页（showAllParticipants）显示这行实际报名人数——
          X 是"发起人 + 参与者"的真实已加入人数，跟活动的 capacity 设置无关
          （capacity 只决定要不要补空位/封顶，不是这里要展示的数字）。活动
          卡片不传 showAllParticipants，不会多出这一行。 */}
      {showAllParticipants ? (
        <p className="mb-2 text-sm text-text-muted">共 {joinedCount} 人参加</p>
      ) : null}
      <ul className={gridClassName}>
        {slots.map((slot, index) => {
          if (slot.type === "organizer") {
            return (
              <li key={`organizer-${organizerId}`}>
                <SlotAvatar
                  avatarUrl={organizerAvatarUrl}
                  initial={organizerDisplayName.trim().charAt(0).toUpperCase() || "?"}
                  isOrganizer
                  shape={shape}
                />
              </li>
            );
          }

          if (slot.type === "participant") {
            const { participant } = slot;
            const avatar = (
              <SlotAvatar
                avatarUrl={participant.avatarUrl}
                initial={participant.displayName.trim().charAt(0).toUpperCase() || "?"}
                shape={shape}
              />
            );

            if (!interactive) {
              return <li key={participant.userId}>{avatar}</li>;
            }

            return (
              <li key={participant.userId}>
                <Link
                  to={`/users/${participant.userId}`}
                  aria-label={`查看 ${participant.displayName} 的主页`}
                >
                  {avatar}
                </Link>
              </li>
            );
          }

          if (!interactive) {
            return (
              <li key={`empty-${index}`}>
                <span aria-hidden="true" className={emptySlotClassName}>
                  <Plus size={18} />
                </span>
              </li>
            );
          }

          return (
            <li key={`empty-${index}`}>
              <button
                type="button"
                aria-label="报名加入活动"
                disabled={!canTapEmptySlot}
                onClick={canTapEmptySlot ? onTapEmptySlot : undefined}
                className={`${emptySlotClassName} disabled:cursor-not-allowed disabled:opacity-60 ${canTapEmptySlot ? "hover:border-primary hover:text-primary" : ""}`}
              >
                <Plus size={18} />
              </button>
            </li>
          );
        })}
        {overflowCount > 0 ? (
          <li>
            {/* 07 号卡明确要求"+N"溢出徽标是"灰底深字"，不是原来的
                text-text-muted 浅灰字——这里换成 text-text。overflowCount
                在 shape="square" 时恒为 0（见 computeSlots 的
                allowOverflowBadge），这个分支实际只有 shape="round" 会
                触发，沿用圆形版本的样式没有问题。 */}
            <span
              aria-hidden="true"
              className={`flex ${AVATAR_SIZE_CLASS_NAME} ${AVATAR_RING_CLASS_NAME} items-center justify-center rounded-full bg-bg text-sm font-semibold text-text`}
            >
              +{overflowCount}
            </span>
          </li>
        ) : null}
      </ul>
      {/* shape="square" 时头像格铺满卡片整宽、没有左右内边距（见
          SQUARE_AVATAR_GRID_CLASS_NAME 的注释），但这一行"还差 N 人"文字
          不是拼图的一部分，需要单独补回横向内边距，才能跟卡片下半部分
          标题/地点/时间那些文字（在 activity-card.tsx 里用同一个 p-5）
          左右对齐，不是让文字也跟着贴到卡片边缘。
          17 号卡：详情页（showAllParticipants）不需要这条 px-5 补偿——
          详情页整个内容列已经在页面级容器上统一加了 px-4（见
          activity-detail-page.tsx），头像格本身跟其它段落一样贴着容器
          内边缘对齐，这里再叠一层 px-5 反而会让这行文字比页面上其它文字
          多缩进一截，所以只在"卡片场景"（isSquare 但不是 showAllParticipants）
          才补这个内边距。 */}
      <p className={`mt-2 text-xs text-text-muted ${isSquare && !showAllParticipants ? "px-5" : ""}`}>
        {formatActivityParticipantSummary(participants.length, capacity)}
      </p>
    </div>
  );
}
