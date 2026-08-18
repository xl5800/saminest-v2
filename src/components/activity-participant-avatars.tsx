import { Crown, Plus } from "lucide-react";

import type { ActivityParticipant } from "../repositories/activities-repository";
import { formatActivityParticipantSummary } from "../utils/format";

// 头像堆叠一共最多展示 6 个视觉位置（发起人+参与者+空位合计）。这个常量
// 只控制"最多画几个真实头像/空位"，第 6 个位置永远是"+N"溢出徽标，不是
// 第 6 个真实头像——所以它比总视觉位置数少 1，见下面 renderSlots 的说明。
// 数值目前是 5，之所以拉成一个命名常量而不是散落的魔法数字，是因为这是
// 这个仓库第一次引入"头像堆叠 + 溢出徽标"这种 UI 模式（参考 Slack/GitHub
// 的头像堆叠），后续如果要调整"多少人以内不折叠"，改这一个值就够。
export const MAX_VISIBLE_SLOTS = 5;

const AVATAR_SIZE_CLASS_NAME = "h-11 w-11";

export interface ActivityParticipantAvatarsProps {
  organizerId: string;
  organizerDisplayName: string;
  organizerAvatarUrl: string | null;
  /** 已经不包含发起人（活动发起人从不出现在 activity_participants 表里，
   *  见 activities-repository.ts 的 listActivityParticipants）。 */
  participants: ActivityParticipant[];
  capacity: number | null;
  /** 当前用户能不能点空位报名——已经报名/申请中/被拒绝/未登录/活动未开放
   *  这几种情况都应该是 false，跟"参加活动"按钮是否可点完全同一份判断，
   *  由调用方（ActivityDetailPage）传入，这个组件自己不重新判断一遍。 */
  canTapEmptySlot: boolean;
  onTapEmptySlot: () => void;
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
 * 不是可选项。
 */
function SlotAvatar({ avatarUrl, initial, isOrganizer }: SlotAvatarProps) {
  return (
    <div className="relative">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className={`${AVATAR_SIZE_CLASS_NAME} rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex ${AVATAR_SIZE_CLASS_NAME} items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary`}
        >
          {initial}
        </span>
      )}
      {isOrganizer ? (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white ring-2 ring-white"
        >
          <Crown size={10} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * 活动详情页头像堆叠——"这次改动里最核心、也最需要仔细做的部分"（任务卡
 * 原话）。发起人永远是第一个头像（带皇冠角标），后面跟参与者，capacity
 * 不为 null 时再补"空位"占位（虚线圆 + Plus 图标，点击复用"参加活动"
 * 按钮的同一套状态/逻辑，见 ActivityDetailPage 里
 * useActivityParticipationAction 的用法）。capacity 为 null（不限人数）
 * 时没有"空位"这个概念，只画发起人+参与者。
 *
 * 总视觉位置最多 6 个（发起人+参与者+空位合计）：超过时只画前
 * MAX_VISIBLE_SLOTS（5）个真实头像/空位，第 6 个位置换成一个"+N"的数字
 * 溢出徽标（参考 Slack/GitHub 头像堆叠的折叠方式），不是这个仓库之前
 * 出现过的模式。溢出徽标本身不可点、纯展示——完整名单仍然在下面的
 * "参与者（N）"文字区块里，从头像堆叠本身点不进完整名单是任务卡明确认可
 * 的取舍，不是漏做。
 */
export function ActivityParticipantAvatars({
  organizerId,
  organizerDisplayName,
  organizerAvatarUrl,
  participants,
  capacity,
  canTapEmptySlot,
  onTapEmptySlot
}: ActivityParticipantAvatarsProps) {
  const emptySlotCount =
    capacity === null ? 0 : Math.max(capacity - 1 - participants.length, 0);

  const slots: Slot[] = [
    { type: "organizer" },
    ...participants.map((participant): Slot => ({ type: "participant", participant })),
    ...Array.from({ length: emptySlotCount }, (): Slot => ({ type: "empty" }))
  ];

  const overflowCount = slots.length > MAX_VISIBLE_SLOTS + 1 ? slots.length - MAX_VISIBLE_SLOTS : 0;
  const visibleSlots = overflowCount > 0 ? slots.slice(0, MAX_VISIBLE_SLOTS) : slots;

  return (
    <div>
      <ul className="flex flex-wrap items-center gap-2">
        {visibleSlots.map((slot, index) => {
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
            return (
              <li key={slot.participant.userId}>
                <SlotAvatar
                  avatarUrl={slot.participant.avatarUrl}
                  initial={slot.participant.displayName.trim().charAt(0).toUpperCase() || "?"}
                />
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
                className={`flex ${AVATAR_SIZE_CLASS_NAME} items-center justify-center rounded-full border-2 border-dashed border-border text-text-muted disabled:cursor-not-allowed disabled:opacity-60 ${canTapEmptySlot ? "hover:border-primary hover:text-primary" : ""}`}
              >
                <Plus size={18} />
              </button>
            </li>
          );
        })}
        {overflowCount > 0 ? (
          <li>
            <span
              aria-hidden="true"
              className={`flex ${AVATAR_SIZE_CLASS_NAME} items-center justify-center rounded-full bg-bg text-sm font-semibold text-text-muted`}
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
