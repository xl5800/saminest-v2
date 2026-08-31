import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listActiveActivityRegions, createActivity } = vi.hoisted(() => ({
  listActiveActivityRegions: vi.fn(),
  createActivity: vi.fn()
}));

vi.mock("../../repositories/locations-repository", () => ({
  listActiveActivityRegions
}));
vi.mock("../../repositories/activities-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/activities-repository")>();
  return { ...actual, createActivity };
});

import { usePendingActivityFormDraftStore } from "../../store/pending-activity-form-draft-store";
import { usePendingFormRegionStore } from "../../store/pending-form-region-store";
import { useAuthStore } from "../../store/auth-store";
import { CreateActivityPage } from "./create-activity-page";

const initialAuthState = useAuthStore.getState();
const initialPendingRegionState = usePendingFormRegionStore.getState();
const initialPendingActivityDraftState = usePendingActivityFormDraftStore.getState();

/**
 * 27 号卡：这份测试专门复现"选择州清空已输入内容"这个 bug 本身，所以
 * 故意不像 create-activity-page.test.tsx 那样把 useNavigate 整个 mock
 * 成一个空壳 spy——那种写法点"选择州"只是记录一次调用，从来不会真的
 * 触发路由跳转，也就永远不会让 CreateActivityPage 真的卸载重挂载，测不出
 * 这个 bug（这也是这个 bug 之前一直没被自动化测试拦下来的原因）。这里用
 * 真正的 MemoryRouter + 两条真实路由，点击"选择州"会真的导航到
 * /region-select，之后再真的导航回来，才能验证组件被卸载重挂载之后，
 * 其它字段是不是还在。
 *
 * /region-select 用一个极简的替身组件，不渲染真正的 RegionSelectPage——
 * 那个页面自己还有 useCitiesWithStateQuery/useRegionContentCountsQuery
 * 等一堆依赖，跟"CreateActivityPage 自己的字段会不会在真实路由跳转里被
 * 清空"这件事无关，这里只需要复刻它退出时的真实约定：挂载后立刻往
 * usePendingFormRegionStore 写一个选中结果、然后 navigate(-1) 回到上一页
 * ——分别对应 region-select-page.tsx 的 selectState()/selectCity() 和
 * navigate(-1) 这两步。
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

function renderWithRealRouting() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/activities/new"]}>
        <Routes>
          <Route path="/activities/new" element={<CreateActivityPage />} />
          <Route path="/region-select" element={<FakeRegionSelectStep />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * 时效保险测试专用的替身——跟上面 FakeRegionSelectStep 的区别是"返回"这
 * 一步不是挂载就自动触发，而是要点一下按钮才发生。这样测试才能在
 * "点选择州（草稿写入）"和"点这个按钮返回（草稿被读取）"这两步之间插入
 * Date.now() 的推进，模拟"用户在 /region-select 停留了很久才返回"，
 * 不然两步会在同一个事件循环里同步跑完，没有机会模拟时间流逝。
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

function renderWithManualReturn() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/activities/new"]}>
        <Routes>
          <Route path="/activities/new" element={<CreateActivityPage />} />
          <Route path="/region-select" element={<FakeRegionSelectStepManualReturn />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CreateActivityPage — real navigation round-trip through /region-select (27 号卡)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePendingFormRegionStore.setState(initialPendingRegionState, true);
    usePendingActivityFormDraftStore.setState(initialPendingActivityDraftState, true);
    listActiveActivityRegions.mockReset();
    createActivity.mockReset();
    listActiveActivityRegions.mockResolvedValue([{ id: "loc-1", name: "VA", stateCode: "VA" }]);
  });

  it("keeps 细分标签/标题/说明/开始时间 after a real navigation round-trip through 选择州", async () => {
    renderWithRealRouting();

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));
    fireEvent.change(screen.getByLabelText(/细分标签/), { target: { value: "火锅" } });
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "周末吃火锅" } });
    fireEvent.change(screen.getByLabelText(/说明/), { target: { value: "一起吃火锅，AA制" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: "2099-01-01T10:00" }
    });

    // 点"选择州"——这是真实的路由跳转（不是 mock 出来的空调用），
    // CreateActivityPage 会真的卸载，FakeRegionSelectStep 挂载、立刻
        // 写回选中结果并 navigate(-1)，CreateActivityPage 重新挂载。
    fireEvent.click(screen.getByText("请选择州"));

    // 地区字段本身在改版前就没问题（靠 pendingRegion 这个页面外部的
    // store 回填），这里确认它确实回填成功，作为"跳转+返回这个流程本身
    // 真的完整跑通"的前提断言。
    expect(await screen.findByText("VA 弗吉尼亚州")).toBeInTheDocument();

    // 这才是这次要修的 bug：其它字段在改版前会全部被清空，改版后应该
    // 原样保留。
    expect(screen.getByLabelText(/细分标签/)).toHaveValue("火锅");
    expect(screen.getByLabelText(/标题/)).toHaveValue("周末吃火锅");
    expect(screen.getByLabelText(/说明/)).toHaveValue("一起吃火锅，AA制");
    expect(screen.getByLabelText(/开始时间/)).toHaveValue("2099-01-01T10:00");
    expect(screen.getByRole("button", { name: /吃饭搭子/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("still submits successfully (normal publish flow is not broken) after the round-trip", async () => {
    createActivity.mockResolvedValue({ id: "act-999" });
    renderWithRealRouting();

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "周末吃火锅" } });
    fireEvent.change(screen.getByLabelText(/说明/), { target: { value: "一起吃火锅，AA制" } });
    fireEvent.change(screen.getByLabelText(/开始时间/), {
      target: { value: "2099-01-01T10:00" }
    });

    fireEvent.click(screen.getByText("请选择州"));
    await screen.findByText("VA 弗吉尼亚州");

    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await vi.waitFor(() => {
      expect(createActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "周末吃火锅",
          description: "一起吃火锅，AA制",
          locationId: "loc-1"
        })
      );
    });
  });

  // 27.1.3：确认"线上活动"这个联动 checkbox 不会触发同样的问题——它只是
  // 一次普通的本地 setState，不涉及任何路由跳转，不应该让页面卸载重挂载。
  it("does NOT clear other fields when toggling 线上活动 (no navigation involved, unlike 选择州)", () => {
    renderWithRealRouting();

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "周末吃火锅" } });
    fireEvent.change(screen.getByLabelText(/说明/), { target: { value: "一起吃火锅，AA制" } });

    fireEvent.click(screen.getByLabelText(/线上活动/));

    expect(screen.getByLabelText(/标题/)).toHaveValue("周末吃火锅");
    expect(screen.getByLabelText(/说明/)).toHaveValue("一起吃火锅，AA制");
  });

  // 时效保险：如果用户点了"选择州"之后没有很快走完这个来回（比如在
  // /region-select 停留超过 5 分钟才返回），草稿应该被当成过期、不回填——
  // 不直接用 vi.useFakeTimers() 推进真实时间，而是只 mock Date.now()：
  // 这两个 store 内部判断新鲜度全靠 Date.now()，直接控制它就够验证这条
  // 分支，不用把 regions 查询的 Promise 解析、findByText 轮询这些真实
  // 异步逻辑也一起拖进假时钟的复杂度里。
  it("does not restore the draft if the round-trip through 选择州 took longer than 5 minutes (TTL 安全网)", async () => {
    renderWithManualReturn();

    fireEvent.click(screen.getByRole("button", { name: /吃饭搭子/ }));
    fireEvent.change(screen.getByLabelText(/标题/), { target: { value: "周末吃火锅" } });
    fireEvent.change(screen.getByLabelText(/说明/), { target: { value: "一起吃火锅，AA制" } });

    // 基准用真实当前时间（不是一个很小的固定值）——mock 成一个远早于
    // 真实时间的历史时刻会让 QueryClient 内部基于 Date.now() 算缓存
    // GC/重试延迟的逻辑算出离谱的超大数字，冒出无关的
    // TimeoutOverflowWarning 噪音，跟这条测试本身要验证的东西无关。
    const baseTime = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(baseTime);
    fireEvent.click(screen.getByText("请选择州")); // saveDraft() 这一刻记的是 T0

    nowSpy.mockReturnValue(baseTime + 6 * 60 * 1000); // 模拟在 /region-select 停留了 6 分钟
    fireEvent.click(screen.getByRole("button", { name: "confirm-region" })); // 重新挂载读取草稿的这一刻是 T0+6min
    nowSpy.mockRestore();

    // 地区字段本身没有时效限制（pendingRegion 是另一个 store），确认跳转
    // +返回这个流程本身真的完整跑通，不是因为点击没生效才"侥幸"没回填。
    expect(await screen.findByText("VA 弗吉尼亚州")).toBeInTheDocument();

    // 但草稿已经过期，标题/说明不应该被回填。
    expect(screen.getByLabelText(/标题/)).toHaveValue("");
    expect(screen.getByLabelText(/说明/)).toHaveValue("");
    expect(screen.getByRole("button", { name: /吃饭搭子/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
