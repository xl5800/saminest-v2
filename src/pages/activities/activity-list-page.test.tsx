import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActivities, listActiveActivityRegions, listActivityParticipantPreviews } = vi.hoisted(
  () => ({
    listActivities: vi.fn(),
    listActiveActivityRegions: vi.fn(),
    listActivityParticipantPreviews: vi.fn()
  })
);

vi.mock("../../repositories/activities-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/activities-repository")>();
  return { ...actual, listActivities, listActivityParticipantPreviews };
});
vi.mock("../../repositories/locations-repository", () => ({
  listActiveActivityRegions
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { ActivityListPage } from "./activity-list-page";

const sampleActivity = {
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
  participantCount: 2,
  status: "open"
};

describe("ActivityListPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listActivities.mockReset();
    listActiveActivityRegions.mockReset();
    listActivityParticipantPreviews.mockReset();
    listActiveActivityRegions.mockResolvedValue([{ id: "loc-1", name: "VA" }]);
    listActivityParticipantPreviews.mockResolvedValue(new Map());
  });

  it("shows a loading message before the query resolves", () => {
    listActivities.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<ActivityListPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
  });

  it("shows an error message when the query fails", async () => {
    listActivities.mockRejectedValue(new Error("network down"));

    renderWithProviders(<ActivityListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("活动加载失败，请稍后重试。");
  });

  it("shows an empty state instead of crashing when there are no matching activities", async () => {
    listActivities.mockResolvedValue([]);

    renderWithProviders(<ActivityListPage />);

    expect(
      await screen.findByText("暂时没有符合条件的活动，换个筛选条件试试，或者自己发起一个。")
    ).toBeInTheDocument();
  });

  it("renders a single-column list (not the old waterfall) with one card per activity, each linking to /activities/:id", async () => {
    listActivities.mockResolvedValue([sampleActivity]);

    const { container } = renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    expect(link).toHaveAttribute("href", "/activities/act-1");
    // 单栏纵向：容器是 flex-col，不再是两栏瀑布流的 columns-2。
    expect(container.querySelector(".flex.flex-col.gap-3")).toBeInTheDocument();
    expect(container.querySelector(".columns-2")).not.toBeInTheDocument();
  });

  it("renders emoji+title, location/landmark, and start time on the card", async () => {
    listActivities.mockResolvedValue([sampleActivity]);

    renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    expect(link).toHaveTextContent("🍜 周末吃火锅");
    expect(link).toHaveTextContent("海底捞");
    expect(link).toHaveTextContent(/08-20/);
  });

  it("no longer renders a separate channel-label pill or a participant-summary line on the card (that information now lives inside the avatar stack's own caption)", async () => {
    listActivities.mockResolvedValue([sampleActivity]);

    renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    // "吃饭搭子"（频道 pill 的文案）不应该出现在卡片里——频道信息现在只
    // 靠标题前的 emoji 传达。人数摘要（"还差 N 人（.../4）"）由头像堆叠
    // 组件自带的 caption 承担，同一条信息不应该在卡片里重复出现第二次。
    expect(link).not.toHaveTextContent("吃饭搭子");
    const summaryOccurrences = (link.textContent ?? "").match(/还差 \d+ 人/g) ?? [];
    expect(summaryOccurrences).toHaveLength(1);
  });

  it("renders the ActivityParticipantAvatars stack with the organizer's crown badge, in non-interactive mode (no <button> for empty slots)", async () => {
    // capacity 4、发起人 1 人、没有查到参与者预览 → 应该有 3 个空位，
    // 如果这些空位被渲染成 <button>，就会出现"<a> 嵌套 <button>"这种
    // 非法结构。
    listActivities.mockResolvedValue([sampleActivity]);

    const { container } = renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    expect(container.querySelector("svg.lucide-crown")).toBeInTheDocument();
    // 卡片整体是一个 <Link>（<a>），它内部不应该出现任何 <button>。
    expect(link.querySelectorAll("button")).toHaveLength(0);
  });

  it("batch-queries participant previews for all loaded activity ids", async () => {
    listActivities.mockResolvedValue([sampleActivity]);

    renderWithProviders(<ActivityListPage />);

    await waitFor(() => {
      expect(listActivityParticipantPreviews).toHaveBeenCalledWith(["act-1"]);
    });
  });

  it("passes each card's own preview list from the batch result, keyed by activity id", async () => {
    listActivities.mockResolvedValue([sampleActivity, { ...sampleActivity, id: "act-2" }]);
    listActivityParticipantPreviews.mockResolvedValue(
      new Map([["act-1", [{ userId: "user-2", displayName: "Bob", avatarUrl: null }]]])
    );

    renderWithProviders(<ActivityListPage />);

    // act-1 的卡片应该多出 Bob 的头像首字母占位（"B"），act-2 没有对应的
    // 预览条目，只画发起人（Alice 的"A"）。
    await screen.findByText("B");
    const aInitials = screen.getAllByText("A");
    expect(aInitials).toHaveLength(2);
  });

  it("shows '线上' instead of a landmark/location when isOnline is true", async () => {
    listActivities.mockResolvedValue([{ ...sampleActivity, isOnline: true, landmarkText: null }]);

    renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    expect(link).toHaveTextContent("线上");
  });

  it("queries with no channel/region filter by default", async () => {
    listActivities.mockResolvedValue([]);

    renderWithProviders(<ActivityListPage />);

    await waitFor(() => {
      expect(listActivities).toHaveBeenCalledWith({ channel: undefined, locationId: undefined });
    });
  });

  it("re-queries with the selected channel when a channel pill is clicked", async () => {
    listActivities.mockResolvedValue([]);

    renderWithProviders(<ActivityListPage />);
    await waitFor(() => expect(listActivities).toHaveBeenCalled());
    listActivities.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));

    await waitFor(() => {
      expect(listActivities).toHaveBeenCalledWith({ channel: "food", locationId: undefined });
    });
  });

  it("re-queries with the selected region when the region dropdown changes", async () => {
    listActivities.mockResolvedValue([]);

    renderWithProviders(<ActivityListPage />);
    await waitFor(() => expect(listActivities).toHaveBeenCalled());
    listActivities.mockClear();

    const select = await screen.findByLabelText("州");
    fireEvent.change(select, { target: { value: "loc-1" } });

    await waitFor(() => {
      expect(listActivities).toHaveBeenCalledWith({ channel: undefined, locationId: "loc-1" });
    });
  });
});
