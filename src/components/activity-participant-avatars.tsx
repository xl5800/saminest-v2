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
 */
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
}

type Slot =
  | { type: "organizer" }
  | { type: "participant"; participant: ActivityParticipant }
  | { type: "empty" };

interface SlotAvatarProps {
  avatarUrl: string | null;
  initial: string;
  isOrganizer?: boolean;
}

/**
 * 单个头像格：有图用 <img>，没有就用昵称首字母圆形占位——跟
 * conversation-page.tsx 的 Avatar 组件是同一套展示逻辑。发起人角标
 * （lucide-react 的 Crown）绝对定位在右下角，大约是头像的 1/3
 * 大小——这是设计稿之外、参照 Meetup"发起人身份要显眼"原则主动加的，
 * 不是可选项；07 号卡把头像放大到 64px 时，角标也按同一比例从 16px 放大
 * 到 20px，图标本身从 10px 放大到 12px。
 */
function SlotAvatar({ avatarUrl, initial, isOrganizer }: SlotAvatarProps) {
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
 */
function computeSlots(
  participants: ActivityParticipant[],
  capacity: number | null
): { slots: Slot[]; overflowCount: number } {
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
  onTapEmptySlot
}: ActivityParticipantAvatarsProps) {
  const { slots, overflowCount } = computeSlots(participants, capacity);

  return (
    <div>
      <ul className={AVATAR_GRID_CLASS_NAME}>
        {slots.map((slot, index) => {
          if (slot.type === "organizer") {
            return (
              <li key={`organizer-${organizerId}`}>
                <SlotAvatar
                  avatarUrl={organizerAvatarUrl}
                  initial={organizerDisplayName.trim().charAt(0).toUpperCase() || "?"}
                  isOrganizer
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
                <span aria-hidden="true" className={EMPTY_SLOT_CLASS_NAME}>
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
                className={`${EMPTY_SLOT_CLASS_NAME} disabled:cursor-not-allowed disabled:opacity-60 ${canTapEmptySlot ? "hover:border-primary hover:text-primary" : ""}`}
              >
                <Plus size={18} />
              </button>
            </li>
          );
        })}
        {overflowCount > 0 ? (
          <li>
            {/* 07 号卡明确要求"+N"溢出徽标是"灰底深字"，不是原来的
                text-text-muted 浅灰字——这里换成 text-text。 */}
            <span
              aria-hidden="true"
              className={`flex ${AVATAR_SIZE_CLASS_NAME} ${AVATAR_RING_CLASS_NAME} items-center justify-center rounded-full bg-bg text-sm font-semibold text-text`}
            >
              +{overflowCount}
            </span>
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-xs text-text-muted">
        {formatActivityParticipantSummary(participants.length, capacity)}
      </p>
    </div>
  );
}
