import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActivities, listActivityParticipantPreviews, navigateMock } = vi.hoisted(() => ({
  listActivities: vi.fn(),
  listActivityParticipantPreviews: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../repositories/activities-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/activities-repository")>();
  return { ...actual, listActivities, listActivityParticipantPreviews };
});
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { renderWithProviders } from "../../test/render-with-providers";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { ActivityListPage } from "./activity-list-page";

const initialRegionState = useSelectedRegionStore.getState();

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
    listActivityParticipantPreviews.mockReset();
    navigateMock.mockReset();
    listActivityParticipantPreviews.mockResolvedValue(new Map());
    useSelectedRegionStore.setState(initialRegionState, true);
    localStorage.clear();
  });

  // 14 号卡（找搭子页改版：顶部栏 + 活动卡片头像展示）：居中的"找搭子"
  // 标题整个删掉了，顶部换成 TopBar home 变体的"Saminest + 当前地区"
  // 胶囊——不再有任何居中大标题，也不再有改版前的"🤝 一起去"。
  it("no longer renders a centered '找搭子'/'🤝 一起去' heading — the TopBar is now the home-variant brand pill", () => {
    listActivities.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<ActivityListPage />);

    expect(screen.queryByRole("heading", { name: "找搭子" })).not.toBeInTheDocument();
    expect(screen.queryByText("🤝 一起去")).not.toBeInTheDocument();
  });

  describe("TopBar (14 号卡：顶部栏合并成一个胶囊按钮)", () => {
    it("renders the 'Saminest' brand pill (same as the home page), with a placeholder when no region is selected", () => {
      listActivities.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ActivityListPage />);

      expect(screen.getByText("Saminest")).toBeInTheDocument();
      expect(screen.getByText("选择地区")).toBeInTheDocument();
    });

    it("shows the globally selected region's label on the pill's second line — same store/format as the home page", () => {
      listActivities.mockReturnValue(new Promise(() => {}));
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "VA",
        stateName: "Virginia",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<ActivityListPage />);

      expect(screen.getByText("VA 弗吉尼亚州")).toBeInTheDocument();
    });

    it("navigates to /region-select when the pill is clicked, same route as the home page's entry point", () => {
      listActivities.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ActivityListPage />);

      fireEvent.click(screen.getByRole("button", { name: "Saminest 选择地区" }));

      expect(navigateMock).toHaveBeenCalledWith("/region-select");
    });

    it("renders only a search icon on the right — no '＋' create button (this page's FAB is the only publish entry point)", () => {
      listActivities.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ActivityListPage />);

      expect(screen.getByRole("button", { name: "搜索" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "发布" })).not.toBeInTheDocument();
    });

    it("toggles a search input open/closed when the search icon is clicked", () => {
      listActivities.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ActivityListPage />);

      expect(screen.queryByPlaceholderText("搜找搭子活动…")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "搜索" }));
      expect(screen.getByPlaceholderText("搜找搭子活动…")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "搜索" }));
      expect(screen.queryByPlaceholderText("搜找搭子活动…")).not.toBeInTheDocument();
    });
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
    expect(link).not.toHaveTextContent("吃饭搭子");
    const summaryOccurrences = (link.textContent ?? "").match(/还差 \d+ 人/g) ?? [];
    expect(summaryOccurrences).toHaveLength(1);
  });

  it("renders the ActivityParticipantAvatars stack with the organizer's crown badge, in non-interactive mode (no <button> for empty slots)", async () => {
    listActivities.mockResolvedValue([sampleActivity]);

    const { container } = renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    expect(container.querySelector("svg.lucide-crown")).toBeInTheDocument();
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
      expect(listActivities).toHaveBeenCalledWith({ channel: undefined, stateCode: undefined });
    });
  });

  it("re-queries with the selected channel when a channel pill is clicked", async () => {
    listActivities.mockResolvedValue([]);

    renderWithProviders(<ActivityListPage />);
    await waitFor(() => expect(listActivities).toHaveBeenCalled());
    listActivities.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));

    await waitFor(() => {
      expect(listActivities).toHaveBeenCalledWith({ channel: "food", stateCode: undefined });
    });
  });

  // 08 号卡：这个页面原来自己维护的"筛选"图标 + 州下拉框已经删掉，改成
  // 直接读全局 useSelectedRegionStore——跟首页是同一个选中状态，见
  // activity-list-page.tsx 顶部注释。
  describe("region filter (useSelectedRegionStore, 08 号卡)", () => {
    it("no longer renders a page-local '筛选' button or 州 dropdown", async () => {
      listActivities.mockResolvedValue([]);

      renderWithProviders(<ActivityListPage />);
      await waitFor(() => expect(listActivities).toHaveBeenCalled());

      expect(screen.queryByRole("button", { name: "筛选" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("州")).not.toBeInTheDocument();
    });

    it("queries activities with the globally selected region's stateCode", async () => {
      listActivities.mockResolvedValue([]);
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "VA",
        stateName: "Virginia",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<ActivityListPage />);

      await waitFor(() => {
        expect(listActivities).toHaveBeenCalledWith({ channel: undefined, stateCode: "VA" });
      });
    });

    // 08 号卡 8.4：选中了某个州、没有额外选中频道、结果为空时，展示
    // "发起第一个"的引导，而不是通用的"换个筛选条件试试"文案。
    it("shows the region empty state ('这个地区还没有搭子活动，发起第一个吧') when the selected region has no activities and no channel filter is active", async () => {
      listActivities.mockResolvedValue([]);
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "CA",
        stateName: "California",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<ActivityListPage />);

      expect(
        await screen.findByText("这个地区还没有搭子活动，发起第一个吧")
      ).toBeInTheDocument();
      expect(
        screen.queryByText("暂时没有符合条件的活动，换个筛选条件试试，或者自己发起一个。")
      ).not.toBeInTheDocument();

      // 页面上这时有两个"发起搭子"按钮——空状态里的这个 + 常驻的悬浮 Fab，
      // 空状态的按钮先出现在 DOM 里（见 activity-list-page.tsx 里 Fab 是
      // 挂在这段内容后面的），取第一个。
      const [emptyStatePublishButton] = screen.getAllByRole("button", { name: "发起搭子" });
      fireEvent.click(emptyStatePublishButton);
      expect(navigateMock).toHaveBeenCalledWith("/activities/new");
    });

    it("falls back to the generic empty-state message when a channel filter is also active, even with a region selected", async () => {
      listActivities.mockResolvedValue([]);
      useSelectedRegionStore.getState().setSelectedRegion({
        stateCode: "CA",
        stateName: "California",
        cityId: null,
        cityName: null
      });

      renderWithProviders(<ActivityListPage />);
      await waitFor(() => expect(listActivities).toHaveBeenCalled());
      fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));

      expect(
        await screen.findByText("暂时没有符合条件的活动，换个筛选条件试试，或者自己发起一个。")
      ).toBeInTheDocument();
      expect(
        screen.queryByText("这个地区还没有搭子活动，发起第一个吧")
      ).not.toBeInTheDocument();
    });

    it("falls back to the generic empty-state message when no region is selected", async () => {
      listActivities.mockResolvedValue([]);

      renderWithProviders(<ActivityListPage />);

      expect(
        await screen.findByText("暂时没有符合条件的活动，换个筛选条件试试，或者自己发起一个。")
      ).toBeInTheDocument();
    });
  });

  // 04 号卡验收标准：悬浮按钮点击后直接进入发布搭子内容表单，中间没有
  // 类型选择弹层。
  it("navigates straight to /activities/new when the dark FAB '发起搭子' is clicked (no type-selection sheet in between)", async () => {
    listActivities.mockResolvedValue([]);

    renderWithProviders(<ActivityListPage />);
    await waitFor(() => expect(listActivities).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /发起搭子/ }));

    expect(navigateMock).toHaveBeenCalledWith("/activities/new");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
