import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActivities, listActiveLocations } = vi.hoisted(() => ({
  listActivities: vi.fn(),
  listActiveLocations: vi.fn()
}));

vi.mock("../../repositories/activities-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/activities-repository")>();
  return { ...actual, listActivities };
});
vi.mock("../../repositories/locations-repository", () => ({
  listActiveLocations
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { ActivityListPage } from "./activity-list-page";

const sampleActivity = {
  id: "act-1",
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
    listActiveLocations.mockReset();
    listActiveLocations.mockResolvedValue([{ id: "loc-1", name: "Rockville" }]);
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

  it("renders a card with emoji+title, location/landmark, start time, channel label and participant summary, linking to /activities/:id", async () => {
    listActivities.mockResolvedValue([sampleActivity]);

    renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link", { name: /周末吃火锅/ });
    expect(link).toHaveAttribute("href", "/activities/act-1");
    expect(link).toHaveTextContent("🍜 周末吃火锅");
    expect(link).toHaveTextContent("海底捞");
    expect(link).toHaveTextContent("吃饭搭子");
    expect(link).toHaveTextContent("还差 2 人（2/4）");
  });

  it("shows '线上' instead of a landmark/location when isOnline is true", async () => {
    listActivities.mockResolvedValue([{ ...sampleActivity, isOnline: true, landmarkText: null }]);

    renderWithProviders(<ActivityListPage />);

    const link = await screen.findByRole("link");
    expect(link).toHaveTextContent("线上");
  });

  it("queries with no channel/city filter by default", async () => {
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

  it("re-queries with the selected city when the city dropdown changes", async () => {
    listActivities.mockResolvedValue([]);

    renderWithProviders(<ActivityListPage />);
    await waitFor(() => expect(listActivities).toHaveBeenCalled());
    listActivities.mockClear();

    const select = await screen.findByLabelText("城市");
    fireEvent.change(select, { target: { value: "loc-1" } });

    await waitFor(() => {
      expect(listActivities).toHaveBeenCalledWith({ channel: undefined, locationId: "loc-1" });
    });
  });
});
