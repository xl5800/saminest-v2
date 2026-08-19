import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveActivityRegions, createActivity, navigateMock } = vi.hoisted(() => ({
  listActiveActivityRegions: vi.fn(),
  createActivity: vi.fn(),
  navigateMock: vi.fn()
}));

vi.mock("../../repositories/locations-repository", () => ({
  listActiveActivityRegions
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

// 频道从 <select> 换成了 Chips（04 号卡改版），fillRequiredFields 相应地
// 改成点击对应的 Chip 按钮，其余字段的 <label> 文本没变，继续用
// getByLabelText。
function fillRequiredFields() {
  fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));
  fireEvent.change(screen.getByLabelText(/标题/), {
    target: { value: "周末吃火锅" }
  });
  fireEvent.change(screen.getByLabelText(/说明/), {
    target: { value: "一起吃火锅，AA制" }
  });
  fireEvent.change(screen.getByLabelText(/^州/), { target: { value: "loc-1" } });
  fireEvent.change(screen.getByLabelText(/开始时间/), {
    target: { value: "2099-01-01T10:00" }
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "发布" }));
}

describe("CreateActivityPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listActiveActivityRegions.mockReset();
    createActivity.mockReset();
    navigateMock.mockReset();

    listActiveActivityRegions.mockResolvedValue([{ id: "loc-1", name: "VA" }]);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
  });

  it("renders the TopBar create variant: title '发布搭子内容' and a text '发布' submit button", () => {
    renderWithProviders(<CreateActivityPage />);

    expect(screen.getByRole("heading", { name: "发布搭子内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发布" })).toBeInTheDocument();
  });

  it("renders region options loaded from the database, not hardcoded", async () => {
    renderWithProviders(<CreateActivityPage />);

    expect(await screen.findByRole("option", { name: "VA" })).toBeInTheDocument();
    expect(listActiveActivityRegions).toHaveBeenCalled();
  });

  it("does not render any field for organizer_id or status", () => {
    renderWithProviders(<CreateActivityPage />);

    expect(screen.queryByLabelText(/发起人/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/状态/)).not.toBeInTheDocument();
  });

  it("renders the channel options as a chip row (not a <select>)", () => {
    renderWithProviders(<CreateActivityPage />);

    const chip = screen.getByRole("button", { name: /吃饭搭子/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("blocks submission and shows the validation message when the title is empty", async () => {
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "VA" });

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));
    fireEvent.change(screen.getByLabelText(/说明/), {
      target: { value: "一起吃火锅，AA制" }
    });
    fireEvent.change(screen.getByLabelText(/^州/), { target: { value: "loc-1" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: "2099-01-01T10:00" }
    });
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入标题。");
    expect(createActivity).not.toHaveBeenCalled();
  });

  it("blocks submission when the activity is offline and no region is selected", async () => {
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "VA" });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/^州/), { target: { value: "" } });
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("线下活动请选择州。");
    expect(createActivity).not.toHaveBeenCalled();
  });

  it("allows submission without a region when '线上活动' is checked", async () => {
    createActivity.mockResolvedValue({ id: "act-999" });
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "VA" });

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "线上小聚" } });
    fireEvent.change(screen.getByLabelText(/说明/), { target: { value: "线上一起玩" } });
    fireEvent.click(screen.getByLabelText(/线上活动/));
    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: "2099-01-01T10:00" }
    });
    submit();

    await waitFor(() => {
      expect(createActivity).toHaveBeenCalledWith(
        expect.objectContaining({ isOnline: true, locationId: null })
      );
    });
  });

  it("submits organizerId from the auth store, maps all fields through createActivity, and navigates to the new activity's detail page", async () => {
    createActivity.mockResolvedValue({ id: "act-999" });
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "VA" });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/细分标签/), { target: { value: "火锅" } });
    fireEvent.change(screen.getByLabelText(/具体地标/), { target: { value: "海底捞" } });
    // 人数上限步进器：从"不限"开始，点 4 次"+"到 4。
    const increment = screen.getByRole("button", { name: "增加人数上限" });
    fireEvent.click(increment);
    fireEvent.click(increment);
    fireEvent.click(increment);
    fireEvent.click(increment);
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "wechat" } });
    fireEvent.change(screen.getByLabelText("内容"), { target: { value: "abc123" } });
    submit();

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
        contactValue: "abc123",
        requiresApproval: false
      });
    });

    expect(navigateMock).toHaveBeenCalledWith("/activities/act-999", { replace: true });
  });

  // 步进器边界：从"不限"点一次"-"应该保持禁用/不产生负数或 0，点一次"+"
  // 再点一次"-"应该回到"不限"（空字符串），不是 0。
  it("keeps the capacity stepper's decrement button disabled at '不限' and returns to '不限' after +1/-1", () => {
    renderWithProviders(<CreateActivityPage />);

    const decrement = screen.getByRole("button", { name: "减少人数上限" });
    const increment = screen.getByRole("button", { name: "增加人数上限" });

    expect(screen.getByText("不限")).toBeInTheDocument();
    expect(decrement).toBeDisabled();

    fireEvent.click(increment);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(decrement).not.toBeDisabled();

    fireEvent.click(decrement);
    expect(screen.getByText("不限")).toBeInTheDocument();
    expect(decrement).toBeDisabled();
  });

  it("submits requiresApproval: true when the '需要我同意才能加入' checkbox is checked", async () => {
    createActivity.mockResolvedValue({ id: "act-999" });
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "VA" });

    fillRequiredFields();
    fireEvent.click(screen.getByLabelText(/需要我同意才能加入/));
    submit();

    await waitFor(() => {
      expect(createActivity).toHaveBeenCalledWith(
        expect.objectContaining({ requiresApproval: true })
      );
    });
  });

  it("shows a generic error message and does not navigate when createActivity fails", async () => {
    createActivity.mockRejectedValue(new Error("insert failed"));
    renderWithProviders(<CreateActivityPage />);
    await screen.findByRole("option", { name: "VA" });

    fillRequiredFields();
    submit();

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
    await screen.findByRole("option", { name: "VA" });

    fillRequiredFields();
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
