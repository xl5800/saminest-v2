import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listProfilesForAdmin, setAccountStatus } = vi.hoisted(() => ({
  listProfilesForAdmin: vi.fn(),
  setAccountStatus: vi.fn()
}));

vi.mock("../../repositories/profiles-repository", () => ({
  listProfilesForAdmin
}));
vi.mock("../../repositories/admin-repository", () => ({
  setAccountStatus
}));

import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AdminUsersPage } from "./users-page";

const initialAuthState = useAuthStore.getState();

const sampleUser = {
  id: "user-1",
  displayName: "Alice",
  email: "alice@example.com",
  role: "user",
  accountStatus: "active",
  createdAt: "2026-07-01T00:00:00.000Z"
};

const adminSelf = {
  id: "admin-1",
  displayName: "Admin Bob",
  email: "bob@example.com",
  role: "admin",
  accountStatus: "active",
  createdAt: "2026-07-01T00:00:00.000Z"
};

describe("AdminUsersPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    listProfilesForAdmin.mockReset();
    setAccountStatus.mockReset();
  });

  it("shows a loading state before the query resolves", () => {
    listProfilesForAdmin.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<AdminUsersPage />);

    expect(screen.getByRole("status")).toHaveTextContent("加载中");
  });

  it("shows an empty state when there are no users", async () => {
    listProfilesForAdmin.mockResolvedValue([]);

    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByText("暂无用户")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", async () => {
    listProfilesForAdmin.mockRejectedValue(new Error("network down"));

    renderWithProviders(<AdminUsersPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "用户加载失败，请稍后重试。"
    );
  });

  it("renders each row's display name, email, role, and Chinese account-status label", async () => {
    listProfilesForAdmin.mockResolvedValue([sampleUser]);

    renderWithProviders(<AdminUsersPage />);

    const item = await screen.findByText("Alice");
    const row = item.closest("li");
    expect(row).toHaveTextContent("alice@example.com");
    expect(row).toHaveTextContent("user");
    expect(row).toHaveTextContent("正常");
  });

  it("re-queries with the typed search term when the search form is submitted", async () => {
    listProfilesForAdmin.mockResolvedValue([]);

    renderWithProviders(<AdminUsersPage />);
    await waitFor(() => {
      expect(listProfilesForAdmin).toHaveBeenCalledWith(undefined);
    });

    fireEvent.change(screen.getByLabelText("搜索昵称或邮箱"), {
      target: { value: "alice" }
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    await waitFor(() => {
      expect(listProfilesForAdmin).toHaveBeenCalledWith("alice");
    });
  });

  it("does not render any status-change action button on the current admin's own row", async () => {
    useAuthStore.getState().setSession({ user: { id: "admin-1" } } as never);
    listProfilesForAdmin.mockResolvedValue([adminSelf, sampleUser]);

    renderWithProviders(<AdminUsersPage />);
    await screen.findByText("Admin Bob");

    const selfRow = screen.getByText("Admin Bob").closest("li");
    expect(selfRow).not.toBeNull();
    expect(
      selfRow ? Array.from(selfRow.querySelectorAll("button")) : []
    ).toHaveLength(0);

    // 另一行（不是管理员自己）应该正常有操作按钮。
    const otherRow = screen.getByText("Alice").closest("li");
    expect(
      otherRow?.querySelector("button[type='button']")
    ).not.toBeNull();
  });

  it("only shows actions for statuses other than the row's current status", async () => {
    listProfilesForAdmin.mockResolvedValue([sampleUser]);

    renderWithProviders(<AdminUsersPage />);
    await screen.findByText("Alice");

    const row = screen.getByText("Alice").closest("li") as HTMLElement;
    expect(within(row).getByRole("button", { name: "设为受限" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "设为封禁" })).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: "恢复正常" })
    ).not.toBeInTheDocument();
  });

  it("shows a validation error and does not call setAccountStatus when confirming with an empty reason", async () => {
    listProfilesForAdmin.mockResolvedValue([sampleUser]);

    renderWithProviders(<AdminUsersPage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByRole("button", { name: "设为受限" }));
    fireEvent.click(screen.getByRole("button", { name: "确认设为受限" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写原因。");
    expect(setAccountStatus).not.toHaveBeenCalled();
  });

  it("calls setAccountStatus with the typed reason and updates the row's status without removing it", async () => {
    listProfilesForAdmin.mockResolvedValue([sampleUser]);
    setAccountStatus.mockResolvedValue(undefined);

    renderWithProviders(<AdminUsersPage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByRole("button", { name: "设为受限" }));
    fireEvent.change(screen.getByLabelText("原因"), {
      target: { value: "多次发布违规内容" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认设为受限" }));

    await waitFor(() => {
      expect(setAccountStatus).toHaveBeenCalledWith(
        "user-1",
        "restricted",
        "多次发布违规内容"
      );
    });

    // 这一行应该还在（不是移除队列成员的模式），只是状态文案变了。
    const row = await screen.findByText("Alice").then((el) => el.closest("li"));
    expect(row).toHaveTextContent("受限");
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("preserves the typed reason and shows a row error when setAccountStatus fails", async () => {
    listProfilesForAdmin.mockResolvedValue([sampleUser]);
    setAccountStatus.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminUsersPage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByRole("button", { name: "设为受限" }));
    fireEvent.change(screen.getByLabelText("原因"), {
      target: { value: "多次发布违规内容" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认设为受限" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("原因")).toHaveValue("多次发布违规内容");
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
