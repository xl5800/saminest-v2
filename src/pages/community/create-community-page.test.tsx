import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useMyCommunityRequestsQuery, mutateAsync, isPendingRef } = vi.hoisted(() => ({
  useMyCommunityRequestsQuery: vi.fn(),
  mutateAsync: vi.fn(),
  isPendingRef: { current: false }
}));

vi.mock("../../features/community/use-my-community-requests-query", () => ({
  useMyCommunityRequestsQuery
}));
vi.mock("../../features/community/use-request-community-mutation", () => ({
  useRequestCommunityMutation: () => ({ mutateAsync, isPending: isPendingRef.current })
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { CreateCommunityPage } from "./create-community-page";

const initialAuthState = useAuthStore.getState();

const baseRequest = {
  id: "c-9",
  name: "DMV 羽毛球",
  slug: "c-abc",
  description: null,
  stateCodes: ["VA"],
  status: "rejected",
  rejectionReason: "名字太宽泛",
  createdAt: "2026-10-10T00:00:00.000Z"
};

function renderPage() {
  return renderWithProviders(<CreateCommunityPage />);
}

function fillName(value: string) {
  fireEvent.change(screen.getByPlaceholderText("比如：DMV 华人羽毛球"), { target: { value } });
}

describe("CreateCommunityPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    useMyCommunityRequestsQuery.mockReset();
    useMyCommunityRequestsQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    mutateAsync.mockReset();
    isPendingRef.current = false;
  });

  it("asks for the current user's requests", () => {
    renderPage();
    expect(useMyCommunityRequestsQuery).toHaveBeenCalledWith("user-1");
  });

  it("validates the name length and that at least one state is chosen before submitting", async () => {
    renderPage();

    fillName("A");
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("社区名称需要 2-30 个字。");

    fillName("DMV 羽毛球");
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请至少选择一个覆盖的州。");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("submits name, description and the chosen states (quick chips + dropdown), then shows the success notice", async () => {
    mutateAsync.mockResolvedValue("c-new");
    renderPage();

    fillName("  DMV 羽毛球  ");
    fireEvent.change(screen.getByPlaceholderText("这个社区聊什么？"), { target: { value: "周末约球" } });
    fireEvent.click(screen.getByRole("button", { name: /VA/ }));
    fireEvent.change(screen.getByLabelText("添加其他州"), { target: { value: "NY" } });
    expect(screen.getByRole("button", { name: /移除 NY/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        name: "DMV 羽毛球",
        description: "周末约球",
        stateCodes: ["VA", "NY"]
      })
    );
    expect(await screen.findByText(/申请已提交/)).toBeInTheDocument();
  });

  it("shows the database's friendly message for a taken name", async () => {
    mutateAsync.mockRejectedValue(new AppError("这个社区名已经有人用了，换一个吧。", "COMMUNITY_NAME_TAKEN"));
    renderPage();

    fillName("DMV 华人社区");
    fireEvent.click(screen.getByRole("button", { name: /DC/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("这个社区名已经有人用了，换一个吧。");
  });

  it("falls back to a generic message for unknown failures", async () => {
    mutateAsync.mockRejectedValue(new Error("network"));
    renderPage();

    fillName("DMV 羽毛球");
    fireEvent.click(screen.getByRole("button", { name: /MD/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("提交失败，请稍后重试。");
  });

  it("hides the form while a request is pending review", () => {
    useMyCommunityRequestsQuery.mockReturnValue({
      data: [{ ...baseRequest, status: "pending", rejectionReason: null }],
      isPending: false,
      isError: false
    });
    renderPage();

    expect(screen.queryByRole("button", { name: "提交申请" })).not.toBeInTheDocument();
    expect(screen.getByText(/正在审核中/)).toHaveTextContent("DMV 羽毛球");
  });

  it("lists past requests with their outcome: rejection reason, or a link into an approved community", () => {
    useMyCommunityRequestsQuery.mockReturnValue({
      data: [baseRequest, { ...baseRequest, id: "c-10", name: "DMV 钓鱼", slug: "c-fish", status: "active", rejectionReason: null }],
      isPending: false,
      isError: false
    });
    renderPage();

    const section = screen.getByRole("region", { name: "我的申请" });
    expect(within(section).getByText("未通过")).toBeInTheDocument();
    expect(within(section).getByText("未通过原因：名字太宽泛")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: /进入社区/ })).toHaveAttribute("href", "/community/c-fish");
    // 没有审核中的申请时表单照常显示。
    expect(screen.getByRole("button", { name: "提交申请" })).toBeInTheDocument();
  });
});
