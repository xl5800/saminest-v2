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

// showAllParticipants 的测试需要覆盖到 20 人这种远超 8 个不同首字母名字
// 库存的量级，这里不追求"每个人首字母都不同"（那组测试关心的是溢出徽标
// 具体折掉了谁），只用同一个首字母的生成名字，靠数量断言（getAllByText 的
// 长度、li 元素个数）而不是逐个字母断言。
function makeGenericParticipants(count: number): ActivityParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    userId: `user-${index + 1}`,
    displayName: `P${index + 1}`,
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

    // 17 号卡：反馈原话"方块带小圆角，不是接近全圆"（微信群头像那种观感）
    // ——真实头像格和空位格子都要有一圈小圆角，但不能是 rounded-full（那
    // 样就跟圆形版本没区别了）。这是共享样式，14 号卡上线的活动卡片头像
    // 会跟着这次改动一起变圆角，不是只影响详情页。
    it("gives square avatar tiles and empty slots a small rounded-md corner, not the near-circular rounded-full", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: 2,
        interactive: false,
        shape: "square"
      });

      const organizerAvatar = screen.getByText("A");
      expect(organizerAvatar).toHaveClass("rounded-md");
      expect(organizerAvatar.className).not.toContain("rounded-full");

      const emptySlots = document.querySelectorAll("li span[aria-hidden='true']");
      const emptySlot = Array.from(emptySlots).find((el) => el.querySelector("svg.lucide-plus"));
      expect(emptySlot).toHaveClass("rounded-md");
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

  // 找搭子列表卡片改版任务卡：size="compact" 只给活动卡片改版用，round
  // 变体和 shape="square" 不传 size（详情页、以及上面那组"shape='square'"
  // 测试）的渲染结果不受这组新测试影响——这组只覆盖 compact 特有的行为，
  // 不重复 computeSlots 的 slot 计算规则本身（跟"shape='square'"那组测试
  // 是同一个不重复覆盖的原则）。
  describe("size='compact' (找搭子列表卡片改版：活动卡片小号头像行)", () => {
    it("renders fixed 64px tiles with a small rounded corner, not the full-width aspect-square tiles", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: null,
        shape: "square",
        size: "compact"
      });

      const organizerAvatar = screen.getByText("A");
      expect(organizerAvatar).toHaveClass("h-16", "w-16", "rounded-md");
      expect(organizerAvatar.className).not.toContain("aspect-square");
      expect(organizerAvatar.className).not.toContain("w-full");
      expect(organizerAvatar.className).not.toContain("rounded-full");
    });

    it("lays the row out with flex-wrap (natural wrapping, no horizontal scroll) instead of the full-width 4-column grid", () => {
      const { container } = renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(3),
        capacity: null,
        shape: "square",
        size: "compact"
      });

      const list = container.querySelector("ul");
      expect(list).toHaveClass("flex", "flex-wrap", "gap-2");
      expect(list?.className).not.toContain("grid-cols-4");
    });

    it("renders empty slots as small light-background squares with a '+' icon, matching the compact tile size", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: 4,
        interactive: false,
        shape: "square",
        size: "compact"
      });

      const emptySlots = document.querySelectorAll("li span[aria-hidden='true']");
      const emptySlot = Array.from(emptySlots).find((el) => el.querySelector("svg.lucide-plus"));
      expect(emptySlot).toHaveClass("h-16", "w-16", "rounded-md", "bg-bg");
      expect(emptySlot?.className).not.toContain("aspect-square");
    });

    it("still uses the same slot math as the non-compact square variant (capacity <= 8 fills remaining slots as empty placeholders)", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(2),
        capacity: 6,
        interactive: false,
        shape: "square",
        size: "compact"
      });

      // capacity 6 - 发起人 1 - 参与者 2 = 3 个空位，跟方案图例 1（容量 6，
      // 3 个已加入头像）对应的空位数量一致。
      const emptySlots = Array.from(document.querySelectorAll("li")).filter((li) =>
        li.querySelector("svg.lucide-plus")
      );
      expect(emptySlots).toHaveLength(3);
    });

    it("does not add the card-only px-5 compensation to the caption — the compact row already lives inside the card's own padding", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(2),
        capacity: 4,
        interactive: false,
        shape: "square",
        size: "compact"
      });

      const caption = screen.getByText(formatActivityParticipantSummary(2, 4));
      expect(caption.className).not.toContain("px-5");
    });

    it("does not affect the round (default shape) variant when size='compact' is passed — size only matters for shape='square'", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: null,
        size: "compact"
      });

      const organizerAvatar = screen.getByText("A");
      expect(organizerAvatar).toHaveClass("h-16", "w-16", "rounded-full");
      expect(organizerAvatar.className).not.toContain("h-11");
    });

    it("size left at its default ('default'), with shape='square', renders the original full-width tiles unchanged — locks in the card's pre-redesign behavior for any caller that doesn't opt in", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: null,
        shape: "square"
      });

      const organizerAvatar = screen.getByText("A");
      expect(organizerAvatar).toHaveClass("aspect-square", "w-full", "rounded-md");
      expect(organizerAvatar.className).not.toContain("h-11");
    });
  });

  // 17 号卡（找搭子详情页头像改版）：showAllParticipants 只给详情页用，
  // 关掉"封顶 8 个/'+N' 溢出徽标"这条行为，改成不封顶展示全部参与者，外加
  // 头像格上方一行"共 X 人参加"（X = 发起人 + 参与者的真实已加入人数，
  // 不是 capacity）。这组测试只覆盖 showAllParticipants 新增的行为本身，
  // 不重复 computeSlots 规则 1/2（capacity 封顶、补空位到 8）——那两条
  // 规则完全没有改动，round/square 已有的测试已经覆盖过。
  describe("showAllParticipants (17 号卡：详情页显示全部参与者)", () => {
    it("with 0 participants (organizer only), shows just the organizer and '共 1 人参加'", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: [],
        capacity: null,
        shape: "square",
        showAllParticipants: true
      });

      expect(screen.getByText("共 1 人参加")).toBeInTheDocument();
      expect(screen.getByText("A")).toBeInTheDocument();
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it("with 1 participant, shows '共 2 人参加' and both real avatars", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(1),
        capacity: null,
        shape: "square",
        showAllParticipants: true
      });

      expect(screen.getByText("共 2 人参加")).toBeInTheDocument();
      expect(screen.getByText("A")).toBeInTheDocument();
      expect(screen.getByText("B")).toBeInTheDocument();
    });

    it("with 4 participants, shows '共 5 人参加' and all 5 real avatars", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(4),
        capacity: null,
        shape: "square",
        showAllParticipants: true
      });

      expect(screen.getByText("共 5 人参加")).toBeInTheDocument();
      for (const letter of ["A", "B", "C", "D", "E"]) {
        expect(screen.getByText(letter)).toBeInTheDocument();
      }
    });

    it("with 8 participants (joined count exactly 9), shows '共 9 人参加' and every real avatar — no cap, no '+N' badge", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(8),
        capacity: null,
        shape: "square",
        showAllParticipants: true
      });

      expect(screen.getByText("共 9 人参加")).toBeInTheDocument();
      // Ivy（第 8 个参与者）在卡片的 shape="square" + 不传 showAllParticipants
      // 场景下会被封顶截掉（见上面 14 号卡那组测试），这里必须显示出来，
      // 才能证明详情页确实不再封顶。
      expect(screen.getByText("I")).toBeInTheDocument();
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it("with 9 participants (joined count 10, past the old 8-slot cap), shows all 10 real avatars with no truncation", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeGenericParticipants(9),
        capacity: null,
        shape: "square",
        showAllParticipants: true
      });

      expect(screen.getByText("共 10 人参加")).toBeInTheDocument();
      expect(screen.getByText("A")).toBeInTheDocument();
      // 9 个参与者昵称都以 "P" 开头，占位文字都是 "P"。
      expect(screen.getAllByText("P")).toHaveLength(9);
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
    });

    it("with 20 participants (joined count 21), shows all 21 real avatars with no truncation and no upper limit", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeGenericParticipants(20),
        capacity: null,
        shape: "square",
        showAllParticipants: true
      });

      expect(screen.getByText("共 21 人参加")).toBeInTheDocument();
      expect(screen.getByText("A")).toBeInTheDocument();
      expect(screen.getAllByText("P")).toHaveLength(20);
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
      // 网格允许换行到多行，不设上限——21 个真实头像 + 0 个空位（已加入
      // 人数已经远超 8，规则 2 的补空位分支不会触发）。
      expect(document.querySelectorAll("li").length).toBe(21);
    });

    it("the '共 X 人参加' count reflects actual joined headcount, not the activity's capacity setting", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(2),
        capacity: 50,
        shape: "square",
        showAllParticipants: true
      });

      // 已加入 3 人（发起人 + 2 参与者），跟 capacity=50 完全无关——注意
      // 底部原有的 formatActivityParticipantSummary caption 本来就会显示
      // capacity（"还差 N 人（2/50）"），这里只断言新加的这行标题本身不
      // 包含 50，不是断言整个文档都不出现这个数字。
      const heading = screen.getByText("共 3 人参加");
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).not.toContain("50");
    });

    it("preserves the empty-slot click wiring unchanged — only the tile shape changes, not whether empty slots are drawn", () => {
      const onTapEmptySlot = vi.fn();
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(1),
        capacity: 4,
        canTapEmptySlot: true,
        onTapEmptySlot,
        shape: "square",
        showAllParticipants: true
      });

      // capacity=4 走的是规则 1（capacity ≤ 8），跟 showAllParticipants 无
      // 关（17.4：这张卡不改"要不要画空位"这件事本身）——4 - 发起人1 -
      // 参与者1 = 2 个空位，点击应该还是触发同一个 onTapEmptySlot。
      const emptySlotButtons = screen.getAllByRole("button", { name: "报名加入活动" });
      expect(emptySlotButtons).toHaveLength(2);
      fireEvent.click(emptySlotButtons[0]);
      expect(onTapEmptySlot).toHaveBeenCalledTimes(1);
    });

    it("does not show the '共 X 人参加' heading when showAllParticipants is left at its default (false) — locks in the card's unaffected behavior", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(2),
        capacity: null,
        shape: "square"
      });

      expect(screen.queryByText(/^共 \d+ 人参加$/)).not.toBeInTheDocument();
    });

    // 17 号卡：详情页整个内容列已经在页面级容器统一加了横向内边距，头像
    // 格子跟其它段落一样贴着容器边缘对齐；这个底部 caption 不应该再像卡片
    // 场景那样额外补 px-5，否则会比页面上其它文字多缩进一截。
    it("does not add the card-only px-5 compensation to the bottom caption when showAllParticipants is true", () => {
      renderAvatars({
        organizerId: "org-1",
        organizerDisplayName: "Alice",
        organizerAvatarUrl: null,
        participants: makeParticipants(2),
        capacity: 4,
        shape: "square",
        showAllParticipants: true
      });

      const caption = screen.getByText(formatActivityParticipantSummary(2, 4));
      expect(caption.className).not.toContain("px-5");
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
