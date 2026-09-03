import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { ActivityListItem, ActivityParticipant } from "../repositories/activities-repository";
import { formatActivityStartAt } from "../utils/format";
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

  // 找搭子列表卡片改版：头像行不再铺满卡片宽度贴边（14 号卡那套"外层
  // <Link> 不带内边距、头像区单独顶到边缘"的两段式结构废弃了），整张卡片
  // 改回统一用一层 p-5 内边距——外层 <Link> 直接带 p-5，不再需要 14 号卡
  // 为了不让方形头像格盖住卡片圆角而加的 overflow-hidden（头像格已经不会
  // 顶到卡片边缘，不存在盖住圆角的问题）。
  it("uses a single p-5 padding on the outer <Link> for the whole card (title/summary/avatar row all share it), not the old two-tier 'unpadded link + padded text div' structure", () => {
    const { container } = renderCard();

    const link = container.querySelector("a");
    expect(link).toHaveClass("p-5");
    expect(link?.className).not.toContain("p-3");
    expect(link?.className).not.toContain("overflow-hidden");

    // 不应该再有 14 号卡那种"头像格是 <Link> 第一个直接子元素、文字区是
    // 单独一个带 p-5 的 <div>"的两段式结构——头像行现在跟标题/摘要文字
    // 一样，都是同一层内边距下的普通子元素。
    expect(container.querySelector("a > div.p-5")).not.toBeInTheDocument();
  });

  // 找搭子列表卡片改版：视觉顺序从"头像 → 还差 N 人 → 标题 → 地点 → 时间"
  // 改成"标题 → 地点+时间合并成一行摘要 → 头像行 → 还差 N 人"——用各段
  // 文案在 link.textContent 里出现的先后顺序断言，不依赖具体 DOM 结构。
  it("renders content in the new order: title first, then the merged location+time summary, then the avatar row, then the '还差 N 人' caption", () => {
    const { container } = renderCard();

    const link = screen.getByRole("link", { name: /周末吃火锅/ });
    const text = link.textContent ?? "";
    const titleIndex = text.indexOf("周末吃火锅");
    const summaryIndex = text.indexOf("海底捞");
    const captionIndex = text.indexOf("还差");
    // 头像行本身没有专属文字，用它在 DOM 里的位置（第一个 <ul>）跟标题
    // 文字节点、caption 文字节点比较顺序，间接确认它排在摘要之后、
    // caption 之前。
    const avatarGrid = container.querySelector("ul");
    expect(avatarGrid).toBeInTheDocument();

    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeGreaterThan(titleIndex);
    expect(captionIndex).toBeGreaterThan(summaryIndex);
  });

  // 找搭子列表卡片改版：地点和时间现在合并成同一行摘要文字（用 " · "
  // 拼接），不再是两个分开的 <p>。
  it("merges location and time into a single summary line joined by ' · '", () => {
    const { container } = renderCard();

    // 用 formatActivityStartAt 自己算出预期文案，不硬编码具体的时:分——
    // new Date(startAt) 用的是本地时区，硬编码的小时数在不同时区跑测试
    // 会不一致，跟 activity-detail-page.test.tsx 只断言日期部分（不断言
    // 小时）是同一个顾虑，这里换成动态算出完整预期字符串来精确匹配，而
    // 不是放宽成只匹配日期。
    const expectedSummary = `海底捞 · ${formatActivityStartAt(sampleActivity.startAt)}`;
    const paragraphs = Array.from(container.querySelectorAll("p"));
    const summaryParagraph = paragraphs.find((p) => p.textContent?.includes("海底捞"));
    expect(summaryParagraph).toBeDefined();
    expect(summaryParagraph?.textContent).toBe(expectedSummary);
    // 不应该再有单独一个只包含时间、不包含地点的 <p>（旧的两行结构）。
    expect(paragraphs.some((p) => /^\d{2}-\d{2} \d{2}:\d{2}$/.test(p.textContent ?? ""))).toBe(
      false
    );
  });

  // 找搭子列表卡片改版：头像行改用 size="compact"（固定小号方块，见
  // activity-participant-avatars.tsx），不再是铺满卡片整宽的大号拼图——
  // 用实际渲染出的头像格尺寸类名断言，不只是信任 prop 传对了。
  it("renders the avatar row at the new compact (44px) size, not the old full-width square tiles", () => {
    renderCard();

    // 发起人是昵称首字母占位（没有头像图），文字 "A"。
    const organizerAvatar = screen.getByText("A");
    expect(organizerAvatar).toHaveClass("h-11", "w-11", "rounded-md");
    expect(organizerAvatar.className).not.toContain("aspect-square");
    expect(organizerAvatar.className).not.toContain("w-full");
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
