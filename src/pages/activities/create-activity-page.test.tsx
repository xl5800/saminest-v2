import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveLocations, createActivity, navigateMock } = vi.hoisted(() => ({
  listActiveLocations: vi.fn(),
  createActivity: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../repositories/locations-repository", () => ({
  listActiveLocations
}));
vi.mock("../../repositories/activities-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/activities-repository")>();
  return { ...actual, createActivity };
});
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { CreateActivityPage } from "./create-activity-page";

const initialAuthState = useAuthStore.getState();

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/频道/), { target: { value: "food" } });
  fireEvent.change(screen.getByLabelText(/标题/), {
    target: { value: "周末吃火锅" }
  });
  fireEvent.change(screen.getByLabelText(/说明/), {
    target: { value: "一起吃火锅，AA制" }
  });
  fireEvent.change(screen.getByLabelText(/^城市/), { target: { value: "loc-1" } });
  fireEvent.change(screen.getByLabelText(/开始时间/), {
    target: { value: "2099-01-01T10:00" }
  });
}

describe("CreateActivityPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveLocations.mockReset();
    createActivity.mockReset();
    navigateMock.mockReset();

    listActiveLocations.mockResolvedValue([{ id: "loc-1", name: "Rockville" }]);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
  });

  it("renders location options loaded from the database, not hardcoded", async () => {
    renderWithProviders(<CreateActivityPage />);

    expect(await screen.findByRole("option", { name: "Rockville" })).toBeInTheDocument();
    expect(listActiveLocations).toHaveBeenCalled();
  });

  it("does not render any field for organizer_id or status", () => {
    renderWithProviders(<CreateActivityPage />);

    expect(screen.queryByLabelText(/发起人/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/状态/)).not.toBeInTheDocument();
  });

  it("blocks submission and shows the validation message when the title is empty", async () => {
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "Rockville" });

    fireEvent.change(screen.getByLabelText(/频道/), { target: { value: "food" } });
    fireEvent.change(screen.getByLabelText(/说明/), {
      target: { value: "一起吃火锅，AA制" }
    });
    fireEvent.change(screen.getByLabelText(/^城市/), { target: { value: "loc-1" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: "2099-01-01T10:00" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布活动" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入标题。");
    expect(createActivity).not.toHaveBeenCalled();
  });

  it("blocks submission when the activity is offline and no city is selected", async () => {
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "Rockville" });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/^城市/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "发布活动" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("线下活动请选择城市。");
    expect(createActivity).not.toHaveBeenCalled();
  });

  it("allows submission without a city when '线上活动' is checked", async () => {
    createActivity.mockResolvedValue({ id: "act-999" });
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "Rockville" });

    fireEvent.change(screen.getByLabelText(/频道/), { target: { value: "food" } });
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "线上小聚" } });
    fireEvent.change(screen.getByLabelText(/说明/), { target: { value: "线上一起玩" } });
    fireEvent.click(screen.getByLabelText(/线上活动/));
    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: "2099-01-01T10:00" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布活动" }));

    await waitFor(() => {
      expect(createActivity).toHaveBeenCalledWith(
        expect.objectContaining({ isOnline: true, locationId: null })
      );
    });
  });

  it("submits organizerId from the auth store, maps all fields through createActivity, and navigates to the new activity's detail page", async () => {
    createActivity.mockResolvedValue({ id: "act-999" });
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "Rockville" });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/细分标签/), { target: { value: "火锅" } });
    fireEvent.change(screen.getByLabelText(/具体地标/), { target: { value: "海底捞" } });
    fireEvent.change(screen.getByLabelText(/人数上限/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/联系方式类型/), { target: { value: "wechat" } });
    fireEvent.change(screen.getByLabelText(/联系方式内容/), { target: { value: "abc123" } });
    fireEvent.click(screen.getByRole("button", { name: "发布活动" }));

    await waitFor(() => {
      expect(createActivity).toHaveBeenCalledWith({
        organizerId: "user-1",
        channel: "food",
        tagText: "火锅",
        title: "周末吃火锅",
        description: "一起吃火锅，AA制",
        locationId: "loc-1",
        landmarkText: "海底捞",
        isOnline: false,
        startAt: new Date("2099-01-01T10:00").toISOString(),
        capacity: 4,
        contactMethod: "wechat",
        contactValue: "abc123"
      });
    });

    expect(navigateMock).toHaveBeenCalledWith("/activities/act-999", { replace: true });
  });

  it("shows a generic error message and does not navigate when createActivity fails", async () => {
    createActivity.mockRejectedValue(new Error("insert failed"));
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "Rockville" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布活动" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("发布失败，请稍后重试。");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the account-restricted message and does not navigate when createActivity rejects with ACCOUNT_RESTRICTED", async () => {
    createActivity.mockRejectedValue(
      new AppError(
        "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
        "ACCOUNT_RESTRICTED"
      )
    );
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "Rockville" });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "发布活动" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
