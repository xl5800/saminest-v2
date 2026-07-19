import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listReportsForModeration, resolveReport, dismissReport } = vi.hoisted(() => ({
  listReportsForModeration: vi.fn(),
  resolveReport: vi.fn(),
  dismissReport: vi.fn()
}));

vi.mock("../../repositories/reports-repository", async () => {
  const actual = await vi.importActual<typeof import("../../repositories/reports-repository")>(
    "../../repositories/reports-repository"
  );
  return {
    ...actual,
    listReportsForModeration
  };
});
vi.mock("../../repositories/admin-repository", () => ({
  resolveReport,
  dismissReport
}));

import { renderWithProviders } from "../../test/render-with-providers";
import { AdminReportsPage } from "./reports-page";

const sampleReport = {
  id: "report-1",
  reasonCode: "spam",
  createdAt: "2026-07-01T00:00:00.000Z",
  targetType: "post",
  targetId: "post-1",
  reporterName: "Bob"
};

describe("AdminReportsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listReportsForModeration.mockReset();
    resolveReport.mockReset();
    dismissReport.mockReset();
  });

  it("shows an empty state when there are no reports", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);

    expect(await screen.findByText("暂无举报")).toBeInTheDocument();
  });

  it("renders each report with its reason label, reporter, target, and date", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);

    const item = await screen.findByText("广告/垃圾信息");
    const row = item.closest("li");
    expect(row).toHaveTextContent("Bob");
    expect(row).toHaveTextContent("post / post-1");
  });

  it("defaults the status filter to pending and requests pending reports", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);

    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("pending");
    });
    expect(screen.getByLabelText("状态")).toHaveValue("pending");
  });

  it("re-queries with the new status when the filter changes", async () => {
    listReportsForModeration.mockResolvedValue([]);

    renderWithProviders(<AdminReportsPage />);
    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("pending");
    });

    fireEvent.change(screen.getByLabelText("状态"), { target: { value: "resolved" } });

    await waitFor(() => {
      expect(listReportsForModeration).toHaveBeenCalledWith("resolved");
    });
  });

  it("shows a validation error and does not call resolveReport when confirming with an empty note", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请填写处理说明。");
    expect(resolveReport).not.toHaveBeenCalled();
  });

  it("calls resolveReport with the typed note and removes the row on success", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    resolveReport.mockResolvedValue(undefined);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(resolveReport).toHaveBeenCalledWith("report-1", "已核实并处理");
  });

  it("calls dismissReport with the typed note and removes the row on success", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    dismissReport.mockResolvedValue(undefined);

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "驳回举报" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "举报不成立" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认驳回举报" }));

    await waitFor(() => {
      expect(screen.queryByText("广告/垃圾信息")).not.toBeInTheDocument();
    });
    expect(dismissReport).toHaveBeenCalledWith("report-1", "举报不成立");
  });

  it("keeps the row, shows an error, and preserves the typed note when resolveReport fails", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    resolveReport.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "标记已处理" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "已核实并处理" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认标记已处理" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("处理说明")).toHaveValue("已核实并处理");
    expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
  });

  it("keeps the row, shows an error, and preserves the typed note when dismissReport fails", async () => {
    listReportsForModeration.mockResolvedValue([sampleReport]);
    dismissReport.mockRejectedValue(new Error("boom"));

    renderWithProviders(<AdminReportsPage />);
    await screen.findByText("广告/垃圾信息");

    fireEvent.click(screen.getByRole("button", { name: "驳回举报" }));
    fireEvent.change(screen.getByLabelText("处理说明"), {
      target: { value: "举报不成立" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认驳回举报" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "操作失败，请稍后重试。"
    );
    expect(screen.getByLabelText("处理说明")).toHaveValue("举报不成立");
    expect(screen.getByText("广告/垃圾信息")).toBeInTheDocument();
  });
});
