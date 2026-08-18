import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActivityParticipant } from "../repositories/activities-repository";
import { formatActivityParticipantSummary } from "../utils/format";
import { ActivityParticipantAvatars } from "./activity-participant-avatars";

// 每个参与者用不同首字母的名字（不是 User1/User2 这种共享首字母 "U" 的
// 命名），这样每个头像格渲染出的昵称首字母占位文字互不相同，才能在测试
// 里断言"具体是哪几个人被折进了溢出徽标里"。
const PARTICIPANT_NAMES = ["Bob", "Carol", "Dave", "Eve", "Frank", "Grace"];

function makeParticipants(count: number): ActivityParticipant[] {
  return PARTICIPANT_NAMES.slice(0, count).map((name, index) => ({
    userId: `user-${index + 1}`,
    displayName: name,
    avatarUrl: null
  }));
}

describe("ActivityParticipantAvatars", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the organizer as the first avatar with a crown badge", () => {
    const { container } = render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={[]}
        capacity={null}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );

    // 发起人是昵称首字母占位（没有头像图），文字"A"。
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-crown")).toBeInTheDocument();
  });

  it("does not put a crown badge on participant avatars", () => {
    const { container } = render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(1)}
        capacity={null}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );

    // 只有发起人一个皇冠角标，不是每个头像都有。
    expect(container.querySelectorAll("svg.lucide-crown")).toHaveLength(1);
  });

  it("fills the remaining capacity with empty-slot placeholders (capacity - 1 organizer - participants.length)", () => {
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(1)}
        capacity={4}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );

    // capacity 4 - 发起人 1 - 参与者 1 = 2 个空位。
    expect(screen.getAllByRole("button", { name: "报名加入活动" })).toHaveLength(2);
  });

  it("clamps the empty-slot count to 0 instead of going negative when participants already fill or exceed capacity", () => {
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(5)}
        capacity={4}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "报名加入活动" })).not.toBeInTheDocument();
  });

  it("renders no empty slots at all when capacity is null (unlimited)", () => {
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(2)}
        capacity={null}
        canTapEmptySlot={true}
        onTapEmptySlot={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "报名加入活动" })).not.toBeInTheDocument();
  });

  it("shows a '+N' overflow badge instead of individually drawing every slot once the total exceeds 6", () => {
    // 发起人 1 + 6 个参与者 = 7 个总位置，超过 6：只画前 5 个真实头像，
    // 第 6 个位置换成 "+2"（7 - 5）的溢出徽标。
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(6)}
        capacity={null}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );

    expect(screen.getByText("+2")).toBeInTheDocument();
    // 发起人 Alice + 前 4 个参与者（Bob/Carol/Dave/Eve）= 5 个真实头像；
    // 第 5、6 个参与者（Frank/Grace）被折进"+2"溢出徽标，不再单独画出来。
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.queryByText("F")).not.toBeInTheDocument();
    expect(screen.queryByText("G")).not.toBeInTheDocument();
  });

  it("does not show an overflow badge when the total is exactly at the 6-slot cap", () => {
    // 发起人 1 + 5 个参与者 = 6，正好等于上限，不应该出现溢出徽标。
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(5)}
        capacity={null}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );

    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("does not call onTapEmptySlot when an empty slot is clicked but canTapEmptySlot is false", () => {
    const onTapEmptySlot = vi.fn();
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={[]}
        capacity={2}
        canTapEmptySlot={false}
        onTapEmptySlot={onTapEmptySlot}
      />
    );

    const emptySlotButton = screen.getByRole("button", { name: "报名加入活动" });
    expect(emptySlotButton).toBeDisabled();
    fireEvent.click(emptySlotButton);

    expect(onTapEmptySlot).not.toHaveBeenCalled();
  });

  it("calls onTapEmptySlot when an empty slot is clicked and canTapEmptySlot is true", () => {
    const onTapEmptySlot = vi.fn();
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={[]}
        capacity={2}
        canTapEmptySlot={true}
        onTapEmptySlot={onTapEmptySlot}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "报名加入活动" }));

    expect(onTapEmptySlot).toHaveBeenCalledTimes(1);
  });

  it("interactive={false}: renders no <button> elements at all, even when capacity forces empty slots", () => {
    const { container } = render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(1)}
        capacity={4}
        interactive={false}
      />
    );

    // capacity 4 - 发起人 1 - 参与者 1 = 2 个空位，全部应该渲染成纯展示的
    // <span>，不是 <button>——列表卡片整体是一个 <Link>，塞一个 <button>
    // 进去会产生非法的 "<a> 嵌套 <button>" 结构。
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // Plus 图标视觉还在，只是不可交互。
    expect(container.querySelectorAll("svg.lucide-plus")).toHaveLength(2);
  });

  it("interactive={false}: does not require canTapEmptySlot/onTapEmptySlot — renders fine without them", () => {
    expect(() =>
      render(
        <ActivityParticipantAvatars
          organizerId="org-1"
          organizerDisplayName="Alice"
          organizerAvatarUrl={null}
          participants={[]}
          capacity={2}
          interactive={false}
        />
      )
    ).not.toThrow();
  });

  it("interactive left at its default (true): still renders a clickable <button> empty slot, unchanged from before this prop existed", () => {
    render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={[]}
        capacity={2}
        canTapEmptySlot={true}
        onTapEmptySlot={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "报名加入活动" })).toBeInTheDocument();
  });

  it("maxVisibleSlots: a smaller cap changes the overflow badge's number accordingly", () => {
    // 发起人 1 + 4 个参与者 = 5 个总位置。maxVisibleSlots 传 3 时，超过
    // 3+1=4 个位置就要折叠：只画前 3 个真实头像，溢出徽标显示 "+2"
    // （5 - 3）。同样的数据用默认 MAX_VISIBLE_SLOTS（5）不会溢出，用来
    // 对比验证这个数字确实是 maxVisibleSlots driven，不是巧合。
    const { rerender } = render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(4)}
        capacity={null}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();

    rerender(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(4)}
        capacity={null}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
        maxVisibleSlots={3}
      />
    );
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("shows the shared formatActivityParticipantSummary caption as small, non-emphasized text", () => {
    const { container } = render(
      <ActivityParticipantAvatars
        organizerId="org-1"
        organizerDisplayName="Alice"
        organizerAvatarUrl={null}
        participants={makeParticipants(2)}
        capacity={4}
        canTapEmptySlot={false}
        onTapEmptySlot={vi.fn()}
      />
    );

    const caption = screen.getByText(formatActivityParticipantSummary(2, 4));
    expect(caption.tagName).toBe("P");
    expect(caption.className).toContain("text-xs");
    expect(caption.className).not.toContain("font-bold");
    expect(caption.className).not.toContain("font-semibold");
    expect(container.querySelector("p.text-xs")).toBe(caption);
  });
});
