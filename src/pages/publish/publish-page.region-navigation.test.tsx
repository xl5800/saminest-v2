import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveCategories, listActiveLocations, createPost, getPostDetail, updatePost } =
  vi.hoisted(() => ({
    listActiveCategories: vi.fn(),
    listActiveLocations: vi.fn(),
    createPost: vi.fn(),
    getPostDetail: vi.fn(),
    updatePost: vi.fn()
  }));

vi.mock("../../repositories/categories-repository", () => ({
  listActiveCategories
}));
vi.mock("../../repositories/locations-repository", () => ({
  listActiveLocations
}));
vi.mock("../../repositories/posts-repository", () => ({
  createPost,
  getPostDetail,
  updatePost
}));

import { usePendingFormRegionStore } from "../../store/pending-form-region-store";
import { usePendingPostFormDraftStore } from "../../store/pending-post-form-draft-store";
import { useAuthStore } from "../../store/auth-store";
import { PublishPage } from "./publish-page";

const initialAuthState = useAuthStore.getState();
const initialPendingRegionState = usePendingFormRegionStore.getState();
const initialPendingPostDraftState = usePendingPostFormDraftStore.getState();

/**
 * 27 号卡：跟 create-activity-page.region-navigation.test.tsx 是同一个
 * 道理——publish-page.test.tsx 里 useNavigate 整个 mock 成空壳 spy，点
 * "选择地区"只是记录一次调用，从来不会真的导航，测不出"组件被真实卸载
 * 重挂载后字段是不是还在"这个 bug。这里用真正的 MemoryRouter + 两条
 * 真实路由。/region-select 同样用极简替身（不渲染真正的
 * RegionSelectPage，理由见 create-activity-page.region-navigation.test.tsx
 * 顶部注释）。
 */
function FakeRegionSelectStep() {
  const navigate = useNavigate();

  useEffect(() => {
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: null,
      cityName: null
    });
    navigate(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function renderWithRealRouting(initialEntry = "/publish") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/publish" element={<PublishPage />} />
          <Route path="/publish/:id" element={<PublishPage />} />
          <Route path="/region-select" element={<FakeRegionSelectStep />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * 时效保险测试专用的替身——见
 * create-activity-page.region-navigation.test.tsx 里同名组件的注释，
 * 这里是同一个道理：把"返回"这一步做成手动点击触发，好在"点地区（草稿
 * 写入）"和"点这个按钮返回（草稿被读取）"之间插入 Date.now() 的推进。
 */
function FakeRegionSelectStepManualReturn() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        usePendingFormRegionStore.getState().setPendingRegion({
          stateCode: "VA",
          stateName: "Virginia",
          cityId: null,
          cityName: null
        });
        navigate(-1);
      }}
    >
      confirm-region
    </button>
  );
}

function renderWithManualReturn(initialEntry = "/publish") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/publish" element={<PublishPage />} />
          <Route path="/publish/:id" element={<PublishPage />} />
          <Route path="/region-select" element={<FakeRegionSelectStepManualReturn />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PublishPage — real navigation round-trip through /region-select (27 号卡)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePendingFormRegionStore.setState(initialPendingRegionState, true);
    usePendingPostFormDraftStore.setState(initialPendingPostDraftState, true);
    listActiveCategories.mockReset();
    listActiveLocations.mockReset();
    createPost.mockReset();
    getPostDetail.mockReset();
    updatePost.mockReset();

    listActiveCategories.mockResolvedValue([{ id: "cat-1", slug: "rent", nameZh: "租房" }]);
    listActiveLocations.mockResolvedValue([{ id: "loc-1", name: "Rockville" }]);
  });

  it("keeps 标题/描述/价格/联系方式 after a real navigation round-trip through 地区选择 (新建帖子: 租房/求租/二手共用这个页面)", async () => {
    renderWithRealRouting("/publish");

    await screen.findByRole("option", { name: "租房" });
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "cat-1" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Sunny room" } });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "Nice and quiet, close to metro." }
    });
    fireEvent.change(screen.getByLabelText("价格（可选）"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("联系方式内容"), {
      target: { value: "abc123" }
    });

    // 点"地区"——真实路由跳转，PublishPage 会真的卸载、FakeRegionSelectStep
    // 挂载后立刻写回选中结果并 navigate(-1)，PublishPage 重新挂载。
    fireEvent.click(screen.getByText("不限地区"));

    // 地区字段本身在改版前就没问题（靠 pendingRegion 这个页面外部的
    // store 回填），先确认跳转+返回这个流程本身真的完整跑通。
    expect(await screen.findByText("VA 弗吉尼亚州")).toBeInTheDocument();

    // 这才是这次要修的 bug：其它字段在改版前会被清空（新建模式下打回
    // 空白），改版后应该原样保留。
    expect(screen.getByLabelText("分类")).toHaveValue("cat-1");
    expect(screen.getByLabelText("标题")).toHaveValue("Sunny room");
    expect(screen.getByLabelText("描述")).toHaveValue("Nice and quiet, close to metro.");
    expect(screen.getByLabelText("价格（可选）")).toHaveValue(1200);
    expect(screen.getByLabelText("联系方式内容")).toHaveValue("abc123");
  });

  it("still submits successfully (normal publish flow is not broken) after the round-trip", async () => {
    createPost.mockResolvedValue({ id: "post-999" });
    renderWithRealRouting("/publish");

    await screen.findByRole("option", { name: "租房" });
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "cat-1" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Sunny room" } });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "Nice and quiet, close to metro." }
    });

    fireEvent.click(screen.getByText("不限地区"));
    await screen.findByText("VA 弗吉尼亚州");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Sunny room",
          description: "Nice and quiet, close to metro.",
          locationText: "VA 弗吉尼亚州"
        })
      );
    });
  });

  // 27.1.4：确认编辑模式（/publish/:id）同样受影响、同样被这次修复覆盖——
  // 服务端回填的字段在真实卸载重挂载之后，如果用户已经改过，不应该被
  // 悄悄拉回服务端原始值。
  it("keeps an in-progress edit (not the original server value) after a real navigation round-trip, in edit mode", async () => {
    getPostDetail.mockResolvedValue({
      id: "post-1",
      title: "Original title",
      description: "Original description, long enough to pass validation.",
      priceAmount: 500,
      priceLabel: null,
      currencyCode: "USD",
      categoryId: "cat-1",
      categoryName: "租房",
      locationId: "loc-1",
      locationText: null,
      locationName: "Rockville",
      contactMethod: "email",
      contactValue: "old@example.com",
      status: "approved",
      images: []
    });

    renderWithRealRouting("/publish/post-1");

    expect(await screen.findByDisplayValue("Original title")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Edited title" } });

    fireEvent.click(screen.getByText("Rockville"));
    await screen.findByText("VA 弗吉尼亚州");

    expect(screen.getByLabelText("标题")).toHaveValue("Edited title");
    expect(screen.queryByDisplayValue("Original title")).not.toBeInTheDocument();
  });

  // 时效保险：如果用户点了"选择地区"之后没有很快走完这个来回（比如在
  // /region-select 停留超过 5 分钟才返回），草稿应该被当成过期、不回填。
  // 只 mock Date.now()（两个 store 内部的新鲜度判断全靠它），不用
  // vi.useFakeTimers() 推进真实时间——避免把 categories/regions 查询的
  // Promise 解析、findByText 轮询这些真实异步逻辑也一起拖进假时钟里。
  it("does not restore the draft if the round-trip through 地区选择 took longer than 5 minutes (TTL 安全网)", async () => {
    renderWithManualReturn("/publish");

    await screen.findByRole("option", { name: "租房" });
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "cat-1" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Sunny room" } });
    fireEvent.change(screen.getByLabelText("描述"), {
      target: { value: "Nice and quiet, close to metro." }
    });

    // 基准用真实当前时间（不是一个很小的固定值）——mock 成一个远早于
    // 真实时间的历史时刻会让 QueryClient 内部基于 Date.now() 算缓存
    // GC/重试延迟的逻辑算出离谱的超大数字，冒出无关的
    // TimeoutOverflowWarning 噪音，跟这条测试本身要验证的东西无关。
    const baseTime = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(baseTime);
    fireEvent.click(screen.getByText("不限地区")); // saveDraft() 这一刻记的是 T0

    nowSpy.mockReturnValue(baseTime + 6 * 60 * 1000); // 模拟在 /region-select 停留了 6 分钟
    fireEvent.click(screen.getByRole("button", { name: "confirm-region" }));
    nowSpy.mockRestore();

    // 地区字段本身没有时效限制，确认跳转+返回这个流程本身真的完整跑通。
    expect(await screen.findByText("VA 弗吉尼亚州")).toBeInTheDocument();

    // 但草稿已经过期，分类/标题/描述不应该被回填，退回新建表单的初始态。
    expect(screen.getByLabelText("分类")).toHaveValue("");
    expect(screen.getByLabelText("标题")).toHaveValue("");
    expect(screen.getByLabelText("描述")).toHaveValue("");
  });
});
