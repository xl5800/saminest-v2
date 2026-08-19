import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { renderWithProviders } from "../test/render-with-providers";
import { TopBar } from "./top-bar";

describe("TopBar", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    navigateMock.mockReset();
  });

  describe("home variant", () => {
    it("always renders the 'Saminest' brand name", () => {
      renderWithProviders(
        <TopBar
          variant="home"
          stateName={null}
          onStateClick={vi.fn()}
          onCreateClick={vi.fn()}
          onSearchClick={vi.fn()}
        />
      );

      expect(screen.getByText("Saminest")).toBeInTheDocument();
    });

    it("renders the state name (as a clickable button) + separator dot when stateName is provided", () => {
      renderWithProviders(
        <TopBar
          variant="home"
          stateName="Virginia"
          onStateClick={vi.fn()}
          onCreateClick={vi.fn()}
          onSearchClick={vi.fn()}
        />
      );

      expect(screen.getByRole("button", { name: "Virginia" })).toBeInTheDocument();
      expect(screen.getByText("·")).toBeInTheDocument();
    });

    it("does not render a stray separator dot or a state button when stateName is null", () => {
      renderWithProviders(
        <TopBar
          variant="home"
          stateName={null}
          onStateClick={vi.fn()}
          onCreateClick={vi.fn()}
          onSearchClick={vi.fn()}
        />
      );

      expect(screen.queryByText("·")).not.toBeInTheDocument();
      // 只剩"发布"和"搜索"两个图标按钮，没有第三个州名按钮。
      expect(screen.getAllByRole("button")).toHaveLength(2);
    });

    it("calls onStateClick when the state name button is clicked", () => {
      const onStateClick = vi.fn();
      renderWithProviders(
        <TopBar
          variant="home"
          stateName="Virginia"
          onStateClick={onStateClick}
          onCreateClick={vi.fn()}
          onSearchClick={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Virginia" }));

      expect(onStateClick).toHaveBeenCalledTimes(1);
    });

    it("calls onCreateClick and onSearchClick from their respective icon buttons", () => {
      const onCreateClick = vi.fn();
      const onSearchClick = vi.fn();
      renderWithProviders(
        <TopBar
          variant="home"
          stateName={null}
          onStateClick={vi.fn()}
          onCreateClick={onCreateClick}
          onSearchClick={onSearchClick}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "发布" }));
      fireEvent.click(screen.getByRole("button", { name: "搜索" }));

      expect(onCreateClick).toHaveBeenCalledTimes(1);
      expect(onSearchClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("tab variant", () => {
    it("renders the title as the page heading", () => {
      renderWithProviders(<TopBar variant="tab" title="找搭子" />);

      expect(screen.getByRole("heading", { name: "找搭子" })).toBeInTheDocument();
    });

    it("renders no right-side button when 'right' is not provided (分类页)", () => {
      renderWithProviders(<TopBar variant="tab" title="分类" />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders the caller-supplied right icon button and calls its onClick", () => {
      const onClick = vi.fn();
      renderWithProviders(
        <TopBar
          variant="tab"
          title="消息"
          right={{ icon: <span>🔔</span>, label: "通知", onClick }}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "通知" }));

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("detail variant", () => {
    it("navigates back (navigate(-1)) by default when the back button is clicked", () => {
      renderWithProviders(<TopBar variant="detail" />);

      fireEvent.click(screen.getByRole("button", { name: "返回" }));

      expect(navigateMock).toHaveBeenCalledWith(-1);
    });

    it("calls a caller-supplied onBack instead of the default navigate(-1)", () => {
      const onBack = vi.fn();
      renderWithProviders(<TopBar variant="detail" onBack={onBack} />);

      fireEvent.click(screen.getByRole("button", { name: "返回" }));

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it("renders an optional short title as the page heading", () => {
      renderWithProviders(<TopBar variant="detail" title="活动详情" />);

      expect(screen.getByRole("heading", { name: "活动详情" })).toBeInTheDocument();
    });

    it("renders no heading at all when title is omitted", () => {
      renderWithProviders(<TopBar variant="detail" />);

      expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    });

    it("does not render a '更多' button at all when moreMenu is not supplied", () => {
      renderWithProviders(<TopBar variant="detail" title="活动详情" />);

      // 只有返回按钮，没有更多菜单按钮。
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });

    it("toggles the more-menu popover open/closed when its trigger is clicked, and renders the caller's content", () => {
      renderWithProviders(
        <TopBar
          variant="detail"
          title="活动详情"
          moreMenu={{ label: "更多操作", content: <button type="button">收藏</button> }}
        />
      );

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "收藏" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes the more-menu after clicking one of its own items, while still firing the item's own handler", () => {
      const onFavoriteClick = vi.fn();
      renderWithProviders(
        <TopBar
          variant="detail"
          title="活动详情"
          moreMenu={{
            label: "更多操作",
            content: (
              <button type="button" onClick={onFavoriteClick}>
                收藏
              </button>
            )
          }}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      fireEvent.click(screen.getByRole("button", { name: "收藏" }));

      expect(onFavoriteClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes the more-menu when clicking outside of it", () => {
      renderWithProviders(
        <div>
          <TopBar
            variant="detail"
            title="活动详情"
            moreMenu={{ label: "更多操作", content: <span>菜单内容</span> }}
          />
          <p>页面正文</p>
        </div>
      );

      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByText("页面正文"));
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes the more-menu when pressing Escape", () => {
      renderWithProviders(
        <TopBar
          variant="detail"
          title="活动详情"
          moreMenu={{ label: "更多操作", content: <span>菜单内容</span> }}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  describe("create variant", () => {
    it("navigates back (navigate(-1)) by default when the close button is clicked", () => {
      renderWithProviders(<TopBar variant="create" title="发布搭子内容" onSubmit={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "关闭" }));

      expect(navigateMock).toHaveBeenCalledWith(-1);
    });

    it("calls a caller-supplied onClose instead of the default navigate(-1)", () => {
      const onClose = vi.fn();
      renderWithProviders(
        <TopBar variant="create" title="发布搭子内容" onSubmit={vi.fn()} onClose={onClose} />
      );

      fireEvent.click(screen.getByRole("button", { name: "关闭" }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it("renders the title as the page heading and a bold '发布' submit button by default", () => {
      const onSubmit = vi.fn();
      renderWithProviders(<TopBar variant="create" title="发布搭子内容" onSubmit={onSubmit} />);

      expect(screen.getByRole("heading", { name: "发布搭子内容" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "发布" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("supports a custom submitLabel", () => {
      renderWithProviders(
        <TopBar
          variant="create"
          title="发布帖子"
          onSubmit={vi.fn()}
          submitLabel="保存"
        />
      );

      expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
    });

    it("disables the submit button and does not call onSubmit when submitDisabled is true", () => {
      const onSubmit = vi.fn();
      renderWithProviders(
        <TopBar variant="create" title="发布帖子" onSubmit={onSubmit} submitDisabled={true} />
      );

      const button = screen.getByRole("button", { name: "发布" });
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("nav-only variant", () => {
    it("renders the title as the page heading, a back button, and no right-side button", () => {
      renderWithProviders(<TopBar variant="nav-only" title="地区选择" />);

      expect(screen.getByRole("heading", { name: "地区选择" })).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "返回" }));
      expect(navigateMock).toHaveBeenCalledWith(-1);
    });
  });
});
