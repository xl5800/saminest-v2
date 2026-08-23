import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCreateReportMutation, mutateAsyncMock } = vi.hoisted(() => ({
  useCreateReportMutation: vi.fn(),
  mutateAsyncMock: vi.fn()
}));

vi.mock("../../features/reports/use-create-report-mutation", () => ({
  useCreateReportMutation
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { ReportUserPage } from "./report-user-page";

const initialAuthState = useAuthStore.getState();

function renderPage() {
  return renderWithProviders(<ReportUserPage />, {
    initialEntries: ["/users/user-2/report"],
    route: "/users/:userId/report"
  });
}

function selectReason(label: string) {
  fireEvent.click(screen.getByLabelText(label));
}

describe("ReportUserPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    mutateAsyncMock.mockReset();
    useCreateReportMutation.mockReset();
    useCreateReportMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
  });

  it("renders the '举报用户' heading and the reason options when logged in", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderPage();

    expect(screen.getByRole("heading", { name: "举报用户" })).toBeInTheDocument();
    expect(screen.getByLabelText("诈骗")).toBeInTheDocument();
    expect(screen.getByLabelText("广告/垃圾信息")).toBeInTheDocument();
    expect(screen.getByLabelText("重复发布")).toBeInTheDocument();
    expect(screen.getByLabelText("违规内容")).toBeInTheDocument();
    expect(screen.getByLabelText("虚假/误导信息")).toBeInTheDocument();
    expect(screen.getByLabelText("骚扰")).toBeInTheDocument();
    expect(screen.getByLabelText("侵犯隐私")).toBeInTheDocument();
    expect(screen.getByLabelText("其他")).toBeInTheDocument();
  });

  it("shows a validation error and does not call the mutation when no reason is selected", () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请选择举报原因。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("submits the report with targetType 'user' and the userId from the route, and shows the success feedback", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    mutateAsyncMock.mockResolvedValue({ id: "report-1" });

    renderPage();

    selectReason("诈骗");
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "举报已提交，我们会尽快处理"
    );
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      reporterId: "user-1",
      targetType: "user",
      targetId: "user-2",
      reasonCode: "scam",
      description: null
    });
  });

  it("shows the friendly duplicate-report message when the mutation rejects with REPORT_DUPLICATE", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    mutateAsyncMock.mockRejectedValue(
      new AppError(
        "您已经举报过这条内容，正在处理中，请勿重复提交。",
        "REPORT_DUPLICATE"
      )
    );

    renderPage();

    selectReason("诈骗");
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您已经举报过这条内容，正在处理中，请勿重复提交。"
    );
  });

  it("shows the account-restricted message when the mutation rejects with ACCOUNT_RESTRICTED", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    mutateAsyncMock.mockRejectedValue(
      new AppError(
        "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。",
        "ACCOUNT_RESTRICTED"
      )
    );

    renderPage();

    selectReason("诈骗");
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "您的账号当前处于限制状态，无法执行此操作，如有疑问请联系管理员。"
    );
  });

  it("shows a generic error message and preserves the entered description on a generic failure", async () => {
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    mutateAsyncMock.mockRejectedValue(new Error("network down"));

    renderPage();

    selectReason("诈骗");
    fireEvent.change(screen.getByLabelText("补充说明（可选）"), {
      target: { value: "测试说明文字" }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交举报" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "举报提交失败，请稍后重试。"
    );
    expect(screen.getByLabelText("补充说明（可选）")).toHaveValue("测试说明文字");
  });

  // "不能举报自己"——见 report-user-page.tsx 顶部注释：入口本身在
  // user-profile-page.tsx 已经隐藏，这里单独测这个路由自己的防御性判断
  // （用户手动拼 URL 直接访问自己 id 的情况）。
  describe("self-report guard", () => {
    it("shows a self-report error instead of the form when userId equals the logged-in user's id", () => {
      useAuthStore.getState().setSession({ user: { id: "user-2" } } as never);

      renderPage();

      expect(screen.getByRole("heading", { name: "举报用户" })).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("不能举报自己。");
      expect(screen.queryByRole("button", { name: "提交举报" })).not.toBeInTheDocument();
      expect(mutateAsyncMock).not.toHaveBeenCalled();
    });

    it("renders the normal form when userId does not equal the logged-in user's id", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();

      expect(screen.getByRole("button", { name: "提交举报" })).toBeInTheDocument();
      expect(screen.queryByText("不能举报自己。")).not.toBeInTheDocument();
    });
  });
});
