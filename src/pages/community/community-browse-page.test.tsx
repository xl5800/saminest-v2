import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useDmvCommunityQuery,
  useCommunityMembershipQuery,
  useCommunityPostsTodayCountQuery,
  useJoinCommunityMutation,
  navigateMock,
  mutateMock,
  invalidateQueriesMock
} = vi.hoisted(() => ({
  useDmvCommunityQuery: vi.fn(),
  useCommunityMembershipQuery: vi.fn(),
  useCommunityPostsTodayCountQuery: vi.fn(),
  useJoinCommunityMutation: vi.fn(),
  navigateMock: vi.fn(),
  mutateMock: vi.fn(),
  invalidateQueriesMock: vi.fn()
}));

vi.mock("../../features/community/use-dmv-community-query", () => ({ useDmvCommunityQuery }));
vi.mock("../../features/community/use-community-membership-query", () => ({
  COMMUNITY_MEMBERSHIP_QUERY_KEY: "community-membership",
  useCommunityMembershipQuery
}));
vi.mock("../../features/community/use-community-posts-today-count-query", () => ({
  useCommunityPostsTodayCountQuery
}));
vi.mock("../../features/community/use-join-community-mutation", () => ({
  useJoinCommunityMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});
// 页面里只用 useQueryClient().invalidateQueries——单独换掉它来断言"加入成功后
// 刷新了哪些 query"，其余（QueryClientProvider 等）保持真实实现。
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }) };
});

import { useAuthStore } from "../../store/auth-store";
import { useSelectedRegionStore } from "../../store/selected-region-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { AppError } from "../../utils/app-error";
import { CommunityBrowsePage } from "./community-browse-page";

const initialAuthState = useAuthStore.getState();

const dmvCommunity = {
  id: "c-1",
  name: "DMV 华人社区",
  slug: "dmv",
  description: "来自数据库的简介",
  memberCount: 128
};

function setRegion(stateCode: string | null) {
  useSelectedRegionStore.setState({
    selectedRegion: stateCode
      ? { stateCode, stateName: stateCode, cityId: null, cityName: null }
      : null
  });
}

function renderPage() {
  return renderWithProviders(<CommunityBrowsePage />, { initialEntries: ["/community"] });
}

describe("CommunityBrowsePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    setRegion(null);
    navigateMock.mockReset();
    mutateMock.mockReset();
    invalidateQueriesMock.mockReset();
    useDmvCommunityQuery.mockReturnValue({ data: dmvCommunity, isPending: false, isError: false });
    useCommunityMembershipQuery.mockReturnValue({ data: false, isPending: false, isError: false });
    useCommunityPostsTodayCountQuery.mockReturnValue({ data: 3 });
    useJoinCommunityMutation.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
      isSuccess: false
    });
  });

  describe("header and region row", () => {
    it("renders the large 社区 heading and a search icon button (no TopBar)", () => {
      renderPage();

      expect(screen.getByRole("heading", { level: 1, name: "社区" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "搜索" })).toBeInTheDocument();
    });

    it("shows the formatted selected region on the region row", () => {
      setRegion("VA");

      renderPage();

      expect(screen.getByText("VA 弗吉尼亚州")).toBeInTheDocument();
    });

    it("falls back to the 选择地区 placeholder when no region is selected", () => {
      renderPage();

      expect(screen.getByText("选择地区")).toBeInTheDocument();
    });

    it("navigates to /region-select (no bottom sheet) when the region row is clicked", () => {
      renderPage();

      fireEvent.click(screen.getByText("选择地区"));

      expect(navigateMock).toHaveBeenCalledWith("/region-select");
    });
  });

  describe("tabs", () => {
    it("renders the three tabs with 附近 selected by default", () => {
      renderPage();

      expect(screen.getByRole("tab", { name: "附近" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "我的社区" })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByRole("tab", { name: "发现" })).toHaveAttribute("aria-selected", "false");
    });

    it("switches the selected tab on click, without touching the URL (no navigation)", () => {
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "发现" }));

      expect(screen.getByRole("tab", { name: "发现" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "附近" })).toHaveAttribute("aria-selected", "false");
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe("附近 tab", () => {
    it.each(["VA", "MD", "DC"])("shows the DMV community card when the selected state is %s", (code) => {
      setRegion(code);

      renderPage();

      expect(screen.getByRole("heading", { name: "DMV 华人社区" })).toBeInTheDocument();
      expect(screen.queryByText(/目前只开放了 DMV/)).not.toBeInTheDocument();
    });

    // null 既是新用户的默认值，也是「全美」选项恢复到的状态——意思是"看全部
    // 内容"，DMV 社区应该出现，不能被当成"其它州"显示"暂未开放"。
    it("shows the DMV card when no region is selected (null = see everything)", () => {
      renderPage();

      expect(screen.getByRole("heading", { name: "DMV 华人社区" })).toBeInTheDocument();
    });

    it("shows the 暂未开放 empty state, not an error or blank page, for a state outside DC/MD/VA", () => {
      setRegion("CA");

      renderPage();

      expect(
        screen.getByText("目前只开放了 DMV（DC / MD / VA）一个社区，其它州还没有开放，敬请期待")
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "DMV 华人社区" })).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows a skeleton while the community is loading", () => {
      useDmvCommunityQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

      renderPage();

      expect(screen.getByRole("status")).toHaveTextContent("加载中…");
    });

    it("shows an error alert when the community fails to load", () => {
      useDmvCommunityQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

      renderPage();

      expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
    });

    it("renders member count and today's new post count on the card, and links the card to /community/dmv", () => {
      renderPage();

      expect(screen.getByText("128 位成员 · 今日 3 个新帖子")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "DMV 华人社区" })).toHaveAttribute(
        "href",
        "/community/dmv"
      );
    });

    it("uses the community's own description when set, and a fallback line when it is null", () => {
      const { unmount } = renderPage();
      expect(screen.getByText("来自数据库的简介")).toBeInTheDocument();
      unmount();

      useDmvCommunityQuery.mockReturnValue({
        data: { ...dmvCommunity, description: null },
        isPending: false,
        isError: false
      });
      renderPage();
      expect(screen.getByText("DC / MD / VA 地区华人的本地生活交流社区")).toBeInTheDocument();
    });
  });

  describe("我的社区 tab", () => {
    function openMineTab() {
      fireEvent.click(screen.getByRole("tab", { name: "我的社区" }));
    }

    it("prompts guests to log in, with a link to /login", () => {
      renderPage();
      openMineTab();

      expect(screen.getByText(/登录后可以看到你加入的社区/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "去登录" })).toHaveAttribute("href", "/login");
      expect(screen.queryByRole("heading", { name: "DMV 华人社区" })).not.toBeInTheDocument();
    });

    it("shows the DMV card for a logged-in member", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockReturnValue({ data: true, isPending: false, isError: false });

      renderPage();
      openMineTab();

      expect(screen.getByRole("heading", { name: "DMV 华人社区" })).toBeInTheDocument();
    });

    it("shows the empty message for a logged-in user who has not joined", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      openMineTab();

      expect(screen.getByText("你还没有加入任何社区")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "DMV 华人社区" })).not.toBeInTheDocument();
    });

    it("shows a skeleton (not the empty message) while membership is still being determined", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false
      });

      renderPage();
      openMineTab();

      expect(screen.getByRole("status")).toHaveTextContent("加载中…");
      expect(screen.queryByText("你还没有加入任何社区")).not.toBeInTheDocument();
    });
  });

  describe("发现 tab and the search icon", () => {
    it("renders a search input and a 热门搜索 chip that links to /community/dmv", () => {
      renderPage();
      fireEvent.click(screen.getByRole("tab", { name: "发现" }));

      expect(screen.getByRole("searchbox", { name: "搜索社区" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "DMV 华人社区" })).toHaveAttribute(
        "href",
        "/community/dmv"
      );
    });

    it("switches to 发现 and focuses the search input when the search icon is clicked", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "搜索" }));

      expect(screen.getByRole("tab", { name: "发现" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("searchbox", { name: "搜索社区" })).toHaveFocus();
    });

    it("focuses the search input on icon click even when 发现 is already the active tab", () => {
      renderPage();
      fireEvent.click(screen.getByRole("tab", { name: "发现" }));
      screen.getByRole("searchbox", { name: "搜索社区" }).blur();

      fireEvent.click(screen.getByRole("button", { name: "搜索" }));

      expect(screen.getByRole("searchbox", { name: "搜索社区" })).toHaveFocus();
    });

    // 一次性标记的回归：手动点"发现"Tab 不应该抢焦点（会无故弹出键盘）。
    it("does NOT steal focus when 发现 is opened by clicking the tab itself", () => {
      renderPage();

      fireEvent.click(screen.getByRole("tab", { name: "发现" }));

      expect(screen.getByRole("searchbox", { name: "搜索社区" })).not.toHaveFocus();
    });

    it("does not re-focus the input on a later manual return to 发现 after an icon-triggered visit", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "搜索" }));
      fireEvent.click(screen.getByRole("tab", { name: "附近" }));
      fireEvent.click(screen.getByRole("tab", { name: "发现" }));

      expect(screen.getByRole("searchbox", { name: "搜索社区" })).not.toHaveFocus();
    });
  });

  describe("join button", () => {
    it("navigates a guest to /login and does not call the mutation", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "加入" }));

      expect(navigateMock).toHaveBeenCalledWith("/login");
      expect(mutateMock).not.toHaveBeenCalled();
    });

    it("joins the community for a logged-in user", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "加入" }));

      expect(mutateMock).toHaveBeenCalledWith(
        { communityId: "c-1", userId: "user-1" },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
      );
    });

    it("refreshes both the membership state and the community (member count) after a successful join", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "加入" }));
      mutateMock.mock.calls[0][1].onSuccess();

      expect(invalidateQueriesMock).toHaveBeenCalledWith({
        queryKey: ["community-membership", "c-1", "user-1"]
      });
      expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["community", "dmv"] });
    });

    it("shows ✓ 已加入 (no button) when the user is already a member", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockReturnValue({ data: true, isPending: false, isError: false });

      renderPage();

      expect(screen.getByText("✓ 已加入")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "加入" })).not.toBeInTheDocument();
    });

    // 加入成功到成员状态 refetch 回来之间，按钮不能闪回"加入"。
    it("shows ✓ 已加入 immediately after the join mutation succeeds, before membership refetches", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useJoinCommunityMutation.mockReturnValue({
        mutate: mutateMock,
        isPending: false,
        isSuccess: true
      });

      renderPage();

      expect(screen.getByText("✓ 已加入")).toBeInTheDocument();
    });

    it("disables the button with 加入中… while the join is pending", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useJoinCommunityMutation.mockReturnValue({
        mutate: mutateMock,
        isPending: true,
        isSuccess: false
      });

      renderPage();

      expect(screen.getByRole("button", { name: "加入中…" })).toBeDisabled();
    });

    it("shows the account-restricted message when the join fails with ACCOUNT_RESTRICTED", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "加入" }));
      act(() => {
        mutateMock.mock.calls[0][1].onError(new AppError("账号受限提示", "ACCOUNT_RESTRICTED"));
      });

      expect(screen.getByRole("alert")).toHaveTextContent("账号受限提示");
    });

    it("shows a generic message for any other join failure", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "加入" }));
      act(() => {
        mutateMock.mock.calls[0][1].onError(new Error("network down"));
      });

      expect(screen.getByRole("alert")).toHaveTextContent("加入失败，请稍后重试。");
    });
  });
});
