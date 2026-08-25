import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { ActivityListItem, ActivityParticipant } from "../repositories/activities-repository";
import { ActivityCard } from "./activity-card";

const sampleActivity: ActivityListItem = {
  id: "act-1",
  organizerId: "user-1",
  organizerDisplayName: "Alice",
  organizerAvatarUrl: null,
  channel: "food",
  tagText: "火锅",
  title: "周末吃火锅",
  locationName: "Rockville",
  landmarkText: "海底捞",
  isOnline: false,
  startAt: "2099-08-20T18:00:00.000Z",
  capacity: 4,
  participantCount: 1,
  status: "open",
  requiresApproval: false
};

const sampleParticipants: ActivityParticipant[] = [
  { userId: "user-2", displayName: "Bob", avatarUrl: null }
];

// ActivityCard 本身没有 useQuery/useNavigate，只需要一个 Router 上下文
// （外层 <Link> + 07 号卡新增的参与者头像 <Link>，见
// activity-participant-avatars.test.tsx 同样的原因），不需要
// renderWithProviders 那一整套 QueryClientProvider。
function renderCard(activity: ActivityListItem = sampleActivity, participants = sampleParticipants) {
  return render(
    <MemoryRouter>
      <ActivityCard activity={activity} participants={participants} />
    </MemoryRouter>
  );
}

describe("ActivityCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the whole card as a single <Link> to /activities/:id", () => {
    renderCard();

    const link = screen.getByRole("link", { name: /周末吃火锅/ });
    expect(link).toHaveAttribute("href", "/activities/act-1");
  });

  // 07 号卡：文字区内边距从 12px（p-3）放大到 20px（p-5）。14 号卡把这个
  // p-5 从最外层 <Link> 挪到了头像区下面单独的文字区 <div> 上（外层
  // <Link> 本身不再带内边距，才能让头像拼图贴到卡片边缘），见
  // activity-card.tsx 顶部注释。
  it("uses the new 20px padding (p-5) on the text section below the avatar grid, not the old 12px (p-3)", () => {
    const { container } = renderCard();

    const link = container.querySelector("a");
    expect(link?.className).not.toContain("p-5");
    expect(link?.className).not.toContain("p-3");

    // container.querySelector("a > div") 会先匹配到 ActivityParticipantAvatars
    // 自己的头像+文案外层 <div>（它是 <a> 的第一个子元素，见
    // activity-participant-avatars.tsx 的返回结构），不是这里要断言的文字区
    // <div>，所以用 class 选择器直接定位。
    const textSection = container.querySelector("a > div.p-5");
    expect(textSection).toHaveClass("p-5");
    expect(textSection?.className).not.toContain("p-3");
  });

  // 14 号卡：头像拼图铺满卡片整宽、贴着卡片顶部，不能再有卡片自己的左右
  // 内边距——外层 <Link> 因此不带 p-5，只带 overflow-hidden（配合卡片圆角，
  // 见组件顶部注释），头像格是 <Link> 的第一个直接子元素。
  it("renders the avatar grid flush against the card's edges (no outer padding on the <Link>), clipped to the card's rounded corners", () => {
    const { container } = renderCard();

    const link = container.querySelector("a");
    expect(link).toHaveClass("overflow-hidden");
    expect(link).toHaveClass("rounded-2xl");
    expect(link?.firstElementChild?.querySelector("ul")).toBeInTheDocument();
  });

  it("passes participants/capacity through to the avatar stack in non-interactive mode (no <button> empty slots, since the whole card is already a <Link>)", () => {
    const { container } = renderCard();

    expect(container.querySelector("svg.lucide-crown")).toBeInTheDocument();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  // interactive={false} 同时也意味着参与者头像不应该在卡片内部再包一层
  // <Link>（见 activity-participant-avatars.tsx 里 interactive 的注释）——
  // 卡片里唯一的 <a> 应该是最外层那一个，不能出现 "<a> 嵌套 <a>"。
  it("does not nest any additional <Link>s inside the card's own outer <Link>", () => {
    const { container } = renderCard();

    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("renders emoji+title, location/landmark, and start time", () => {
    renderCard();

    const link = screen.getByRole("link", { name: /周末吃火锅/ });
    expect(link).toHaveTextContent("🍜 周末吃火锅");
    expect(link).toHaveTextContent("海底捞");
    expect(link).toHaveTextContent(/08-20/);
  });
});
