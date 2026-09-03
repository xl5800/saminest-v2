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
  // p-5 从最外层 <Link> 挪到了头像区旁边单独的文字区 <div> 上（外层
  // <Link> 本身不再带内边距，才能让头像拼图贴到卡片边缘），见
  // activity-card.tsx 顶部注释。任务卡 7c 把文字区和头像区的上下顺序换了
  // （文字区现在排在头像区前面，而不是"下面"），但这条内边距结构本身没
  // 变——用 class 选择器直接定位，不依赖顺序，断言不用跟着改。
  it("uses the new 20px padding (p-5) on the text section, separate from the avatar grid, not the old 12px (p-3)", () => {
    const { container } = renderCard();

    const link = container.querySelector("a");
    expect(link?.className).not.toContain("p-5");
    expect(link?.className).not.toContain("p-3");

    // container.querySelector("a > div") 在任务卡 7c 之前会先匹配到
    // ActivityParticipantAvatars 自己的头像+文案外层 <div>（那时它是
    // <a> 的第一个子元素）；任务卡 7c 顺序对调之后，文字区反而变成了第
    // 一个 <div> 子元素，但这里仍然用 class 选择器直接定位，不依赖顺序。
    const textSection = container.querySelector("a > div.p-5");
    expect(textSection).toHaveClass("p-5");
    expect(textSection?.className).not.toContain("p-3");
  });

  // 14 号卡：头像拼图铺满卡片整宽、贴着卡片边缘，不能再有卡片自己的左右
  // 内边距——外层 <Link> 因此不带 p-5，只带 overflow-hidden（配合卡片圆角，
  // 见组件顶部注释）。任务卡 7c 把头像区从 <Link> 的第一个直接子元素挪到
  // 了最后一个（顺序对调，文字区排到了前面）——overflow-hidden/rounded-2xl
  // 这两个类名断言跟顺序无关，不用改；"头像格贴边"这条断言原来查的是
  // firstElementChild，现在头像区排最后，改成查 lastElementChild。
  it("renders the avatar grid flush against the card's edges (no outer padding on the <Link>), clipped to the card's rounded corners", () => {
    const { container } = renderCard();

    const link = container.querySelector("a");
    expect(link).toHaveClass("overflow-hidden");
    expect(link).toHaveClass("rounded-2xl");
    expect(link?.lastElementChild?.querySelector("ul")).toBeInTheDocument();
  });

  // 任务卡 7c（活动卡片视觉还原，只保留顺序对调）：产品验收反馈"找搭子
  // 卡片重排版"那次改版做过头了，只要求把文字块和头像拼图块的上下顺序
  // 对调，其它一切（合并地点+时间、缩小头像、统一 p-5 内边距）都撤销回
  // 14 号卡定的样子——见 activity-card.tsx 顶部注释。这里单独断言"顺序
  // 对调"这一件事本身：文字区（p-5 的 <div>）在 DOM 里排在头像拼图块
  // （<ul> 所在的那个直接子元素）前面。
  it("renders the text block (title/location/time) before the avatar grid block, per 任务卡 7c's order swap", () => {
    const { container } = renderCard();

    const link = container.querySelector("a");
    const children = link ? Array.from(link.children) : [];
    const textBlockIndex = children.findIndex((child) => child.classList.contains("p-5"));
    const avatarBlockIndex = children.findIndex((child) => child.querySelector("ul") !== null);

    expect(textBlockIndex).toBeGreaterThanOrEqual(0);
    expect(avatarBlockIndex).toBeGreaterThanOrEqual(0);
    expect(textBlockIndex).toBeLessThan(avatarBlockIndex);
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
