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

  // 07 号卡：卡片内边距从 12px（p-3）放大到 20px（p-5）。
  it("uses the new 20px card padding (p-5), not the old 12px (p-3)", () => {
    const { container } = renderCard();

    const link = container.querySelector("a");
    expect(link).toHaveClass("p-5");
    expect(link?.className).not.toContain("p-3");
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
