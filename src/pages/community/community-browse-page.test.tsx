import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useListCommunitiesQuery,
  useMyCommunitiesQuery,
  useCommunityMembershipQuery,
  useCommunityPostsTodayCountQuery,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
  navigateMock,
  mutateMock,
  leaveMutateMock
} = vi.hoisted(() => ({
  useListCommunitiesQuery: vi.fn(),
  useMyCommunitiesQuery: vi.fn(),
  useCommunityMembershipQuery: vi.fn(),
  useCommunityPostsTodayCountQuery: vi.fn(),
  useJoinCommunityMutation: vi.fn(),
  useLeaveCommunityMutation: vi.fn(),
  navigateMock: vi.fn(),
  mutateMock: vi.fn(),
  leaveMutateMock: vi.fn()
}));

vi.mock("../../features/community/use-list-communities-query", () => ({ useListCommunitiesQuery }));
vi.mock("../../features/community/use-my-communities-query", () => ({ useMyCommunitiesQuery }));
vi.mock("../../features/community/use-community-membership-query", () => ({
  useCommunityMembershipQuery
}));
vi.mock("../../features/community/use-community-posts-today-count-query", () => ({
  useCommunityPostsTodayCountQuery
}));
vi.mock("../../features/community/use-join-community-mutation", () => ({
  useJoinCommunityMutation
}));
vi.mock("../../features/community/use-leave-community-mutation", () => ({
  useLeaveCommunityMutation
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
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
  memberCount: 128,
  isOfficial: true,
  stateCodes: ["DC", "MD", "VA"]
};
const petsCommunity = {
  id: "c-2",
  name: "DMV 宠物社区",
  slug: "dmv-pets",
  description: null,
  memberCount: 5,
  isOfficial: false,
  stateCodes: ["DC", "MD", "VA"]
};
const studentsCommunity = {
  id: "c-3",
  name: "DMV 留学生社区",
  slug: "dmv-students",
  description: "留学生交流",
  memberCount: 9,
  isOfficial: false,
  stateCodes: ["DC", "MD", "VA"]
};
// 一个只覆盖加州的社区，用来验证"按每个社区自己的 stateCodes 匹配"而不是写死 DC/MD/VA。
const californiaCommunity = {
  id: "c-4",
  name: "湾区华人社区",
  slug: "bay-area",
  description: null,
  memberCount: 1,
  isOfficial: false,
  stateCodes: ["CA"]
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
    leaveMutateMock.mockReset();
    useLeaveCommunityMutation.mockReturnValue({ mutate: leaveMutateMock, isPending: false });
    useListCommunitiesQuery.mockReturnValue({
      data: [dmvCommunity, petsCommunity, studentsCommunity],
      isPending: false,
      isError: false
    });
    useMyCommunitiesQuery.mockReturnValue({ data: undefined, isPending: false, isError: false });
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

    it("opens the 我的社区 tab directly when the URL has ?tab=mine (from the home menu)", () => {
      renderWithProviders(<CommunityBrowsePage />, { initialEntries: ["/community?tab=mine"] });

      expect(screen.getByRole("tab", { name: "我的社区" })).toHaveAttribute("aria-selected", "true");
    });

    it("ignores an unknown ?tab= value and falls back to 附近", () => {
      renderWithProviders(<CommunityBrowsePage />, { initialEntries: ["/community?tab=bogus"] });

      expect(screen.getByRole("tab", { name: "附近" })).toHaveAttribute("aria-selected", "true");
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
    it.each(["VA", "MD", "DC"])(
      "shows all three DMV community cards when the selected state is %s",
      (code) => {
        setRegion(code);

        renderPage();

        expect(screen.getByRole("heading", { name: "DMV 华人社区" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "DMV 宠物社区" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "DMV 留学生社区" })).toBeInTheDocument();
        expect(screen.queryByText(/目前只开放了 DMV/)).not.toBeInTheDocument();
      }
    );

    // null 既是新用户的默认值，也是「全美」选项恢复到的状态——意思是"看全部
    // 内容"，所有社区都应该出现，不能被当成"其它州"显示"暂未开放"。
    it("shows every community when no region is selected (null = see everything)", () => {
      useListCommunitiesQuery.mockReturnValue({
        data: [dmvCommunity, petsCommunity, californiaCommunity],
        isPending: false,
        isError: false
      });

      renderPage();

      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    });

    it("matches each community by its OWN stateCodes: only the community covering the selected state shows up", () => {
      useListCommunitiesQuery.mockReturnValue({
        data: [dmvCommunity, petsCommunity, californiaCommunity],
        isPending: false,
        isError: false
      });
      setRegion("CA");

      renderPage();

      expect(screen.getByRole("heading", { name: "湾区华人社区" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "DMV 华人社区" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "DMV 宠物社区" })).not.toBeInTheDocument();
    });

    it("shows the 暂未开放 empty state, not an error or blank page, when no community covers the selected state", () => {
      setRegion("CA");

      renderPage();

      expect(
        screen.getByText("目前只开放了 DMV（DC / MD / VA）地区的社区，其它州还没有开放，敬请期待")
      ).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows a skeleton while the communities are loading", () => {
      useListCommunitiesQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

      renderPage();

      expect(screen.getByRole("status")).toHaveTextContent("加载中…");
    });

    it("shows an error alert when the communities fail to load", () => {
      useListCommunitiesQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

      renderPage();

      expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
    });

    it("renders member count and today's new post count on a card, and links each card to its own /community/:slug", () => {
      renderPage();

      expect(screen.getAllByText("128 位成员 · 今日 3 个新帖子")).toHaveLength(1);
      expect(screen.getByRole("link", { name: "DMV 华人社区" })).toHaveAttribute(
        "href",
        "/community/dmv"
      );
      expect(screen.getByRole("link", { name: "DMV 宠物社区" })).toHaveAttribute(
        "href",
        "/community/dmv-pets"
      );
      expect(screen.getByRole("link", { name: "DMV 留学生社区" })).toHaveAttribute(
        "href",
        "/community/dmv-students"
      );
    });

    it("uses the community's own description when set, and a fallback line when it is null", () => {
      renderPage();

      expect(screen.getByText("来自数据库的简介")).toBeInTheDocument();
      expect(screen.getByText("暂无简介")).toBeInTheDocument();
    });

    it("shows the verified icon only on official communities' cards", () => {
      const { container } = renderPage();

      // 三张卡片：华人（官方）/ 宠物 / 留学生（非官方）。
      expect(container.querySelectorAll("svg.lucide-badge-check")).toHaveLength(1);
    });

    it("each card asks for its own membership and today's post count", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();

      expect(useCommunityMembershipQuery).toHaveBeenCalledWith("c-1", "user-1");
      expect(useCommunityMembershipQuery).toHaveBeenCalledWith("c-2", "user-1");
      expect(useCommunityMembershipQuery).toHaveBeenCalledWith("c-3", "user-1");
      expect(useCommunityPostsTodayCountQuery).toHaveBeenCalledWith("c-2");
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

    it("renders one card per community the user has really joined (multiple, not just one)", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useMyCommunitiesQuery.mockReturnValue({
        data: [dmvCommunity, studentsCommunity],
        isPending: false,
        isError: false
      });
      useCommunityMembershipQuery.mockReturnValue({ data: true, isPending: false, isError: false });

      renderPage();
      openMineTab();

      expect(useMyCommunitiesQuery).toHaveBeenCalledWith("user-1");
      const panel = screen.getByRole("tabpanel");
      expect(within(panel).getByRole("heading", { name: "DMV 华人社区" })).toBeInTheDocument();
      expect(within(panel).getByRole("heading", { name: "DMV 留学生社区" })).toBeInTheDocument();
      expect(within(panel).queryByRole("heading", { name: "DMV 宠物社区" })).not.toBeInTheDocument();
    });

    it("shows the empty message for a logged-in user who has not joined any community", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useMyCommunitiesQuery.mockReturnValue({ data: [], isPending: false, isError: false });

      renderPage();
      openMineTab();

      expect(screen.getByText("你还没有加入任何社区")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    });

    it("shows a skeleton (not the empty message) while the joined list is still loading", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useMyCommunitiesQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

      renderPage();
      openMineTab();

      expect(screen.getByRole("status")).toHaveTextContent("加载中…");
      expect(screen.queryByText("你还没有加入任何社区")).not.toBeInTheDocument();
    });

    it("shows an error alert when the joined list fails to load", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useMyCommunitiesQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

      renderPage();
      openMineTab();

      expect(screen.getByRole("alert")).toHaveTextContent("社区加载失败，请稍后重试。");
    });
  });

  describe("发现 tab and the search icon", () => {
    it("renders a search input and one 热门搜索 chip per community, each linking to its own feed", () => {
      renderPage();
      fireEvent.click(screen.getByRole("tab", { name: "发现" }));

      expect(screen.getByRole("searchbox", { name: "搜索社区" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "DMV 华人社区" })).toHaveAttribute(
        "href",
        "/community/dmv"
      );
      expect(screen.getByRole("link", { name: "DMV 宠物社区" })).toHaveAttribute(
        "href",
        "/community/dmv-pets"
      );
      expect(screen.getByRole("link", { name: "DMV 留学生社区" })).toHaveAttribute(
        "href",
        "/community/dmv-students"
      );
    });

    it("searches communities (not posts) by name or description as the user types", () => {
      renderPage();
      fireEvent.click(screen.getByRole("tab", { name: "发现" }));

      fireEvent.change(screen.getByRole("searchbox", { name: "搜索社区" }), {
        target: { value: "宠物" }
      });

      expect(screen.getByRole("heading", { name: "DMV 宠物社区" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "DMV 华人社区" })).not.toBeInTheDocument();
      expect(screen.queryByText("热门搜索")).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole("searchbox", { name: "搜索社区" }), {
        target: { value: "留学生交流" }
      });
      expect(screen.getByRole("heading", { name: "DMV 留学生社区" })).toBeInTheDocument();
    });

    it("shows a no-result message when no community matches the keyword", () => {
      renderPage();
      fireEvent.click(screen.getByRole("tab", { name: "发现" }));

      fireEvent.change(screen.getByRole("searchbox", { name: "搜索社区" }), {
        target: { value: "不存在的社区" }
      });

      expect(screen.getByRole("status")).toHaveTextContent("没有找到相关社区");
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

  describe("join button (per card)", () => {
    function joinButtons() {
      return screen.getAllByRole("button", { name: "加入" });
    }

    it("navigates a guest to /login and does not call the mutation", () => {
      renderPage();

      fireEvent.click(joinButtons()[0]);

      expect(navigateMock).toHaveBeenCalledWith("/login");
      expect(mutateMock).not.toHaveBeenCalled();
    });

    it("joins exactly the community whose card was clicked, for a logged-in user", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      // 三张卡片按列表顺序：华人 / 宠物 / 留学生，点第二张（宠物）。
      fireEvent.click(joinButtons()[1]);

      expect(mutateMock).toHaveBeenCalledTimes(1);
      expect(mutateMock).toHaveBeenCalledWith(
        { communityId: "c-2", userId: "user-1" },
        expect.objectContaining({ onError: expect.any(Function) })
      );
    });

    it("shows a 退出 button (instead of 加入) only on the cards of communities the user is already a member of", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockImplementation((communityId: string) => ({
        data: communityId === "c-1",
        isPending: false,
        isError: false
      }));

      renderPage();

      expect(screen.getAllByRole("button", { name: "退出" })).toHaveLength(1);
      expect(joinButtons()).toHaveLength(2);
    });

    it("asks for confirmation before leaving, and 取消 leaves nothing", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockImplementation((communityId: string) => ({
        data: communityId === "c-2",
        isPending: false,
        isError: false
      }));

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "退出" }));

      const dialog = screen.getByRole("dialog", { name: "确认退出社区" });
      expect(dialog).toHaveTextContent("DMV 宠物社区");
      expect(leaveMutateMock).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(leaveMutateMock).not.toHaveBeenCalled();
    });

    it("leaves exactly the community whose 退出 button was clicked, after confirming", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockImplementation((communityId: string) => ({
        data: communityId === "c-2",
        isPending: false,
        isError: false
      }));

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "退出" }));
      fireEvent.click(screen.getByRole("button", { name: "确认退出" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(leaveMutateMock).toHaveBeenCalledWith(
        { communityId: "c-2", userId: "user-1" },
        expect.objectContaining({ onError: expect.any(Function) })
      );
      expect(mutateMock).not.toHaveBeenCalled();
    });

    it("disables the button with 退出中… while the leave is pending", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockReturnValue({ data: true, isPending: false, isError: false });
      useLeaveCommunityMutation.mockReturnValue({ mutate: leaveMutateMock, isPending: true });

      renderPage();

      expect(screen.getAllByRole("button", { name: "退出中…" })[0]).toBeDisabled();
    });

    it("shows a generic message when leaving fails", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useCommunityMembershipQuery.mockImplementation((communityId: string) => ({
        data: communityId === "c-1",
        isPending: false,
        isError: false
      }));

      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "退出" }));
      fireEvent.click(screen.getByRole("button", { name: "确认退出" }));
      act(() => {
        leaveMutateMock.mock.calls[0][1].onError(new Error("network down"));
      });

      expect(screen.getByRole("alert")).toHaveTextContent("退出失败，请稍后重试。");
    });

    it("disables the button with 加入中… while the join is pending", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
      useJoinCommunityMutation.mockReturnValue({
        mutate: mutateMock,
        isPending: true,
        isSuccess: false
      });

      renderPage();

      expect(screen.getAllByRole("button", { name: "加入中…" })[0]).toBeDisabled();
    });

    it("shows the account-restricted message when the join fails with ACCOUNT_RESTRICTED", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      fireEvent.click(joinButtons()[0]);
      act(() => {
        mutateMock.mock.calls[0][1].onError(new AppError("账号受限提示", "ACCOUNT_RESTRICTED"));
      });

      expect(screen.getByRole("alert")).toHaveTextContent("账号受限提示");
    });

    it("shows a generic message for any other join failure", () => {
      useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);

      renderPage();
      fireEvent.click(joinButtons()[0]);
      act(() => {
        mutateMock.mock.calls[0][1].onError(new Error("network down"));
      });

      expect(screen.getByRole("alert")).toHaveTextContent("加入失败，请稍后重试。");
    });
  });
});
