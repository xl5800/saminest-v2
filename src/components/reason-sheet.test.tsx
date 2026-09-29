import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReasonSheet } from "./reason-sheet";

describe("ReasonSheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the title, target line, and reason value", () => {
    render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue="涉嫌虚假信息"
        onReasonChange={vi.fn()}
        errorMessage={null}
        confirmLabel="确认下架"
        destructive
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("下架帖子")).toBeInTheDocument();
    expect(screen.getByText("《Sunny room》")).toBeInTheDocument();
    expect(screen.getByText("下架原因")).toBeInTheDocument();
    expect(screen.getByDisplayValue("涉嫌虚假信息")).toBeInTheDocument();
  });

  it("calls onReasonChange as the reason textarea is edited", () => {
    const onReasonChange = vi.fn();
    render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue=""
        onReasonChange={onReasonChange}
        errorMessage={null}
        confirmLabel="确认下架"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("下架原因"), {
      target: { value: "违反社区规范" }
    });

    expect(onReasonChange).toHaveBeenCalledWith("违反社区规范");
  });

  it("shows the error message with role=alert when provided", () => {
    render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue=""
        onReasonChange={vi.fn()}
        errorMessage="请填写下架原因。"
        confirmLabel="确认下架"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("请填写下架原因。");
  });

  it("does not render an alert when errorMessage is null", () => {
    render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue=""
        onReasonChange={vi.fn()}
        errorMessage={null}
        confirmLabel="确认下架"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses a filled danger button when destructive is true, and a filled primary button otherwise", () => {
    const { rerender } = render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue=""
        onReasonChange={vi.fn()}
        errorMessage={null}
        confirmLabel="确认下架"
        destructive
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "确认下架" })).toHaveClass("bg-danger");

    rerender(
      <ReasonSheet
        title="标记已处理"
        targetLabel="举报 #1"
        reasonLabel="处理说明"
        reasonValue=""
        onReasonChange={vi.fn()}
        errorMessage={null}
        confirmLabel="确认"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "确认" })).toHaveClass("bg-primary");
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue="违反规则"
        onReasonChange={vi.fn()}
        errorMessage={null}
        confirmLabel="确认下架"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "确认下架" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the cancel button, the backdrop, or Escape is used", () => {
    const onClose = vi.fn();
    render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue=""
        onReasonChange={vi.fn()}
        errorMessage={null}
        confirmLabel="确认下架"
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("disables the reason textarea and both buttons while pending", () => {
    render(
      <ReasonSheet
        title="下架帖子"
        targetLabel="《Sunny room》"
        reasonLabel="下架原因"
        reasonValue="违反规则"
        onReasonChange={vi.fn()}
        errorMessage={null}
        confirmLabel="确认下架"
        pending
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByLabelText("下架原因")).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认下架" })).toBeDisabled();
  });

  // 举报处理页"标记已处理"时的"同时删除该帖子"一类附加操作。
  describe("secondaryOption", () => {
    it("does not render the secondary reason field until the checkbox is checked", () => {
      render(
        <ReasonSheet
          title="标记已处理"
          targetLabel="举报 #1"
          reasonLabel="处理说明"
          reasonValue=""
          onReasonChange={vi.fn()}
          errorMessage={null}
          confirmLabel="确认"
          secondaryOption={{
            checkboxLabel: "同时删除该帖子",
            checked: false,
            onCheckedChange: vi.fn(),
            reasonLabel: "删除原因",
            reasonValue: "",
            onReasonChange: vi.fn()
          }}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("同时删除该帖子")).toBeInTheDocument();
      expect(screen.queryByText("删除原因")).not.toBeInTheDocument();
    });

    it("renders and wires the secondary reason field once the checkbox is checked", () => {
      const onCheckedChange = vi.fn();
      const onSecondaryReasonChange = vi.fn();
      render(
        <ReasonSheet
          title="标记已处理"
          targetLabel="举报 #1"
          reasonLabel="处理说明"
          reasonValue=""
          onReasonChange={vi.fn()}
          errorMessage={null}
          confirmLabel="确认"
          secondaryOption={{
            checkboxLabel: "同时删除该帖子",
            checked: true,
            onCheckedChange,
            reasonLabel: "删除原因",
            reasonValue: "垃圾广告",
            onReasonChange: onSecondaryReasonChange
          }}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByDisplayValue("垃圾广告")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("同时删除该帖子"));
      expect(onCheckedChange).toHaveBeenCalledWith(false);

      fireEvent.change(screen.getByLabelText("删除原因"), {
        target: { value: "违规内容" }
      });
      expect(onSecondaryReasonChange).toHaveBeenCalledWith("违规内容");
    });
  });
});
