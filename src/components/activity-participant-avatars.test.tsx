import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActivityParticipant } from "../repositories/activities-repository";
import { formatActivityParticipantSummary } from "../utils/format";
import { ActivityParticipantAvatars } from "./activity-participant-avatars";

// 每个参与者用不同首字母的名字（不是 User1/User2 这种共享首字母 "U" 的
// 命名），这样每个头像格渲染出的昵称首字母占位文字互不相同，才能在测试
// 里断言"具体是哪几个人被折进了溢出徽标里"。8 个名字是为了能测到 07 号卡
// "已加入人数 > 8 才出现溢出徽标"这条规则——发起人 1 + 8 参与者 = 9，
// 正好超过 8。
const PARTICIPANT_NAMES = ["Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Henry", "Ivy"];

function makeParticipants(count: number): ActivityParticipant[] {
  return PARTICIPANT_NAMES.slice(0, count).map((name, index) => ({
    userId: `user-${index + 1}`,
    displayName: name,
    avatarUrl: null
  }));
}

// 组件内部只在 interactive（默认 true）时才会给参与者头像包一层
// react-router 的 <Link>，所以任何默认参数下的渲染都需要一个 Router
// 上下文——跟 render-with-providers.tsx 是同一个原因，但这个组件不用
// useQuery，不需要额外套 QueryClientProvider，直接用 MemoryRouter 就够。
function renderAvatars(props: Parameters<typeof ActivityParticipantAvatars>[0]) {
  return render(
    <MemoryRouter>
      <ActivityParticipantAvatars {...props} />
    </MemoryRouter>
  );
}

describe("ActivityParticipantAvatars", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the organizer as the first avatar with a crown badge", () => {
    const { container } = renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: [],
      capacity: null,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    // 发起人是昵称首字母占位（没有头像图），文字"A"。
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(container.querySelector("svg.lucide-crown")).toBeInTheDocument();
  });

  it("does not put a crown badge on participant avatars", () => {
    const { container } = renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(1),
      capacity: null,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    // 只有发起人一个皇冠角标，不是每个头像都有。
    expect(container.querySelectorAll("svg.lucide-crown")).toHaveLength(1);
  });

  // 07 号卡：头像直径 48px → 64px（h-16 w-16），白色描边 2.5px → 2px
  // （ring-2），投影保持不变。
  it("renders avatars at the new 64px size with a 2px ring, not the old 48px/2.5px", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: [],
      capacity: null
    });

    const organizerAvatar = screen.getByText("A");
    expect(organizerAvatar).toHaveClass("h-16", "w-16", "ring-2");
    expect(organizerAvatar.className).not.toContain("h-12");
    expect(organizerAvatar.className).not.toContain("ring-[2.5px]");
  });

  // 07 号卡：头像行从负 margin 叠放（-space-x-3）改成 4 列固定宽度网格
  // （每行最多 4 个，12px 间距），不再挤在一起。
  it("lays the avatar row out as a fixed 4-column grid with 12px gaps, not the old overlapping -space-x-3 flex row", () => {
    const { container } = renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(3),
      capacity: null
    });

    const list = container.querySelector("ul");
    expect(list).toHaveClass("grid", "gap-3");
    expect(list?.className).toContain("grid-cols-[repeat(4,4rem)]");
    expect(list?.className).not.toContain("-space-x-3");
  });

  // 07 号卡：空位虚线描边颜色明确给了 #D1D5DB（Tailwind 内置的
  // border-gray-300），不再是跟随主题 token 的 border-border。
  it("renders empty slots with the #D1D5DB (border-gray-300) dashed border, not the old theme-token border", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: [],
      capacity: 2,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    const emptySlot = screen.getByRole("button", { name: "报名加入活动" });
    expect(emptySlot).toHaveClass("border-gray-300", "border-dashed", "h-16", "w-16");
    expect(emptySlot.className).not.toContain("border-border");
  });

  // 07 号卡 7.1 规则 1：capacity 不为 null 且 ≤ 8 时，逻辑跟改版前一样——
  // 真实头像 + 虚线空位刚好补满 capacity，不出现"+N"溢出徽标。
  it("rule 1 (capacity <= 8): fills the remaining capacity with empty-slot placeholders, no overflow badge", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(1),
      capacity: 4,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    // capacity 4 - 发起人 1 - 参与者 1 = 2 个空位。
    expect(screen.getAllByRole("button", { name: "报名加入活动" })).toHaveLength(2);
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("rule 1 (capacity <= 8): clamps the empty-slot count to 0 instead of going negative when participants already fill or exceed capacity", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(5),
      capacity: 4,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    expect(screen.queryByRole("button", { name: "报名加入活动" })).not.toBeInTheDocument();
  });

  // 07 号卡 7.1 规则 2：capacity 为 null 或 > 8，且已加入人数 ≤ 8 时，
  // 展示全部真实头像，用虚线空位补到总共 8 个——这是相对改版前的一个
  // 行为变化：改版前 capacity 为 null 时完全不画空位，07 号卡明确要求
  // "有空位"这件事本身要被看出来（哪怕只是个纯视觉提示，不是精确的剩余
  // 名额数字）。
  it("rule 2 (capacity null, joined <= 8): pads with empty-slot placeholders up to 8 total, unlike the old 'no empty slots when unlimited' behavior", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(2),
      capacity: null,
      canTapEmptySlot: true,
      onTapEmptySlot: vi.fn()
    });

    // 已加入 3 人（发起人 + 2 参与者），补到 8 个总位置 = 5 个空位。
    expect(screen.getAllByRole("button", { name: "报名加入活动" })).toHaveLength(5);
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  // 同一条规则 2 对"capacity 是一个具体数字但 > 8"同样成立，不是只有
  // capacity === null 才走这条路径。
  it("rule 2 also applies when capacity is a finite number greater than 8, not just null", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(1),
      capacity: 20,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    // 已加入 2 人，补到 8 个总位置 = 6 个空位。
    expect(screen.getAllByRole("button", { name: "报名加入活动" })).toHaveLength(6);
  });

  // 07 号卡 7.1 规则 3：capacity 为 null 或 > 8，且已加入人数 > 8 时，只
  // 展示前 7 个真实头像，第 8 个位置换成"+N"溢出徽标，不展示任何空位。
  it("rule 3 (capacity null, joined > 8): shows only the first 7 real avatars and an '+N' overflow badge, with no empty-slot placeholders", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(8),
      capacity: null,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    // 已加入 9 人（发起人 + 8 参与者），第 8 个视觉位置的溢出徽标是
    // "+2"（9 - 7）。
    expect(screen.getByText("+2")).toBeInTheDocument();
    // 发起人 Alice + 前 6 个参与者（Bob/Carol/Dave/Eve/Frank/Grace）= 7 个
    // 真实头像；最后 2 个参与者（Henry/Ivy）被折进"+2"溢出徽标。
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("D")).toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
    expect(screen.getByText("G")).toBeInTheDocument();
    expect(screen.queryByText("H")).not.toBeInTheDocument();
    expect(screen.queryByText("I")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "报名加入活动" })).not.toBeInTheDocument();
  });

  // 07 号卡明确要求"+N"溢出徽标是"灰底深字"，不是改版前的
  // text-text-muted 浅灰字。
  it("renders the '+N' overflow badge with dark text (text-text), not the old muted-gray text", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(8),
      capacity: null
    });

    const badge = screen.getByText("+2");
    expect(badge).toHaveClass("text-text");
    expect(badge.className).not.toContain("text-text-muted");
  });

  it("does not show an overflow badge when joined count is exactly at the 8-slot cap", () => {
    // 发起人 1 + 7 个参与者 = 8，正好等于上限，不应该出现溢出徽标，也不
    // 应该出现空位（规则 2 里 emptyCount = 8 - 8 = 0）。
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(7),
      capacity: null,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "报名加入活动" })).not.toBeInTheDocument();
  });

  it("does not call onTapEmptySlot when an empty slot is clicked but canTapEmptySlot is false", () => {
    const onTapEmptySlot = vi.fn();
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: [],
      capacity: 2,
      canTapEmptySlot: false,
      onTapEmptySlot
    });

    const emptySlotButton = screen.getByRole("button", { name: "报名加入活动" });
    expect(emptySlotButton).toBeDisabled();
    fireEvent.click(emptySlotButton);

    expect(onTapEmptySlot).not.toHaveBeenCalled();
  });

  it("calls onTapEmptySlot when an empty slot is clicked and canTapEmptySlot is true", () => {
    const onTapEmptySlot = vi.fn();
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: [],
      capacity: 2,
      canTapEmptySlot: true,
      onTapEmptySlot
    });

    fireEvent.click(screen.getByRole("button", { name: "报名加入活动" }));

    expect(onTapEmptySlot).toHaveBeenCalledTimes(1);
  });

  it("interactive={false}: renders no <button> elements at all, even when capacity forces empty slots", () => {
    const { container } = renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(1),
      capacity: 4,
      interactive: false
    });

    // capacity 4 - 发起人 1 - 参与者 1 = 2 个空位，全部应该渲染成纯展示的
    // <span>，不是 <button>——列表卡片整体是一个 <Link>，塞一个 <button>
    // 进去会产生非法的 "<a> 嵌套 <button>" 结构。
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // Plus 图标视觉还在，只是不可交互。
    expect(container.querySelectorAll("svg.lucide-plus")).toHaveLength(2);
  });

  // 07 号卡 7.3：interactive={false}（列表卡片场景）时参与者头像也不应该
  // 包一层 <Link>——原因跟空位不能是 <button> 完全一样，卡片整体已经是一个
  // <a>，再嵌一层 <a> 是非法 HTML。
  it("interactive={false}: does not wrap participant avatars in a <Link>, avoiding nested <a> elements", () => {
    const { container } = renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(2),
      capacity: null,
      interactive: false
    });

    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("interactive={false}: does not require canTapEmptySlot/onTapEmptySlot — renders fine without them", () => {
    expect(() =>
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: 2,
        interactive: false
      })
    ).not.toThrow();
  });

  it("interactive left at its default (true): still renders a clickable <button> empty slot, unchanged from before this prop existed", () => {
    renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: [],
      capacity: 2,
      canTapEmptySlot: true,
      onTapEmptySlot: vi.fn()
    });

    expect(screen.getByRole("button", { name: "报名加入活动" })).toBeInTheDocument();
  });

  // 07 号卡 7.3：详情页（interactive 默认 true）里，每个参与者头像都应该
  // 是一个指向该参与者公开主页的 <Link>，复用现成的 /users/:userId 路由；
  // 发起人头像格本身不应该被这次改动新加一层链接——发起人已经有单独的
  // 整行入口（在这个组件外面），07 号卡明确要求那个入口维持不变。
  it("interactive default true: wraps each participant avatar (but not the organizer's) in a <Link> to /users/:userId", () => {
    const { container } = renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(2),
      capacity: null
    });

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/users/user-1");
    expect(links[0]).toHaveAccessibleName("查看 Bob 的主页");
    expect(links[1]).toHaveAttribute("href", "/users/user-2");
    expect(links[1]).toHaveAccessibleName("查看 Carol 的主页");

    // 发起人的头像本身不在任何 <a> 里面。
    const organizerAvatar = screen.getByText("A");
    expect(organizerAvatar.closest("a")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(2);
  });

  // 14 号卡（找搭子页改版：顶部栏 + 活动卡片头像展示）：shape="square" 是
  // 活动卡片专用的正方形拼图变体，round 变体（上面那些测试，也是默认值）
  // 保持完全不变——这组测试只覆盖 square 特有的行为，不重复 round 已经
  // 测过的"8 个视觉位置"slot 计算规则本身（两种形状共用同一份
  // computeSlots，round 那些测试已经充分覆盖了 0~9+ 人数下的空位/溢出
  // 数量计算）。
  describe("shape='square' (14 号卡：活动卡片头像)", () => {
    it("lays the grid out as a fluid 4-column grid with a 2px gap, not the round variant's fixed-4rem-column grid", () => {
      const { container } = renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(3),
        capacity: null,
        shape: "square"
      });

      const list = container.querySelector("ul");
      expect(list).toHaveClass("grid", "grid-cols-4", "gap-0.5");
      expect(list?.className).not.toContain("grid-cols-[repeat(4,4rem)]");
    });

    it("renders square (not round) avatar tiles with no ring/shadow border, since separation now comes from the grid gap", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: null,
        shape: "square"
      });

      const organizerAvatar = screen.getByText("A");
      expect(organizerAvatar).toHaveClass("aspect-square", "w-full");
      expect(organizerAvatar.className).not.toContain("rounded-full");
      expect(organizerAvatar.className).not.toContain("ring-2");
      expect(organizerAvatar.className).not.toContain("h-16");
    });

    it("renders empty slots as light-background squares with a '+' icon, not the round variant's dashed circle", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: 4,
        interactive: false,
        shape: "square"
      });

      const emptySlots = document.querySelectorAll("li span[aria-hidden='true']");
      const emptySlot = Array.from(emptySlots).find((el) => el.querySelector("svg.lucide-plus"));
      expect(emptySlot).toHaveClass("aspect-square", "w-full", "bg-bg");
      expect(emptySlot?.className).not.toContain("border-dashed");
      expect(emptySlot?.className).not.toContain("rounded-full");
    });

    // 任务卡 14.2 明确要求"这批先不做'超过 8 人'的处理……先简单只显示前
    // 8 个（不用报错也不用做特殊提示）"——跟 round 变体规则 3 的"+N"溢出
    // 徽标行为不同，这是两种形状唯一的一处 slot 计算分叉（allowOverflowBadge，
    // 见 computeSlots）。
    it("with more than 8 joined (organizer + participants), shows exactly the first 8 real avatars and no '+N' overflow badge", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(8),
        capacity: null,
        shape: "square"
      });

      // 发起人 Alice + 前 7 个参与者（Bob..Henry）= 8 个真实头像，第 8 个
      // 参与者 Ivy 被直接截掉，不显示、也不报错、不提示。
      expect(screen.getByText("A")).toBeInTheDocument();
      expect(screen.getByText("B")).toBeInTheDocument();
      expect(screen.getByText("C")).toBeInTheDocument();
      expect(screen.getByText("D")).toBeInTheDocument();
      expect(screen.getByText("E")).toBeInTheDocument();
      expect(screen.getByText("F")).toBeInTheDocument();
      expect(screen.getByText("G")).toBeInTheDocument();
      expect(screen.getByText("H")).toBeInTheDocument();
      expect(screen.queryByText("I")).not.toBeInTheDocument();
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it("still fills empty-slot placeholders up to 8 total when joined count is 8 or fewer (same slot math as the round variant)", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(2),
        capacity: null,
        interactive: false,
        shape: "square"
      });

      // 已加入 3 人（发起人 + 2 参与者），补到 8 个总位置 = 5 个空位。
      const emptySlots = Array.from(document.querySelectorAll("li")).filter((li) =>
        li.querySelector("svg.lucide-plus")
      );
      expect(emptySlots).toHaveLength(5);
    });

    it("gives the participant-summary caption its own horizontal padding (px-5), since the grid above it has none", () => {
      const { container } = renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(2),
        capacity: 4,
        interactive: false,
        shape: "square"
      });

      const caption = screen.getByText(formatActivityParticipantSummary(2, 4));
      expect(caption).toHaveClass("px-5");
      expect(container.querySelector("ul")?.className).not.toContain("px-5");
    });
  });

  it("shows the shared formatActivityParticipantSummary caption as small, non-emphasized text", () => {
    const { container } = renderAvatars({
      organizerId: "org-1",
      organizerDisplayName: "Alice",
      organizerAvatarUrl: null,
      participants: makeParticipants(2),
      capacity: 4,
      canTapEmptySlot: false,
      onTapEmptySlot: vi.fn()
    });

    const caption = screen.getByText(formatActivityParticipantSummary(2, 4));
    expect(caption.tagName).toBe("P");
    expect(caption.className).toContain("text-xs");
    expect(caption.className).not.toContain("font-bold");
    expect(caption.className).not.toContain("font-semibold");
    expect(container.querySelector("p.text-xs")).toBe(caption);
  });
});
