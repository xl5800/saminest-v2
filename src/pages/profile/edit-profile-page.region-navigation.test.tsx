import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useMyProfileQuery,
  useUpdateProfileMutation,
  listActiveActivityRegions,
  mutateAsyncMock,
  uploadAvatarMock,
  removeAvatarFileMock,
  updateMyAvatarUrl
} = vi.hoisted(() => ({
  useMyProfileQuery: vi.fn(),
  useUpdateProfileMutation: vi.fn(),
  listActiveActivityRegions: vi.fn(),
  mutateAsyncMock: vi.fn(),
  uploadAvatarMock: vi.fn(),
  removeAvatarFileMock: vi.fn(),
  updateMyAvatarUrl: vi.fn()
}));

vi.mock("../../features/profile/use-my-profile-query", () => ({
  useMyProfileQuery
}));
vi.mock("../../features/profile/use-update-profile-mutation", () => ({
  useUpdateProfileMutation
}));
vi.mock("../../repositories/locations-repository", () => ({
  listActiveActivityRegions
}));
vi.mock("../../repositories/profiles-repository", () => ({
  updateMyAvatarUrl
}));
vi.mock("../../services/storage/avatar-storage-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/storage/avatar-storage-service")>();
  return {
    ...actual,
    avatarStorageService: {
      uploadAvatar: uploadAvatarMock,
      removeAvatarFile: removeAvatarFileMock
    }
  };
});

import { usePendingEditProfileFormDraftStore } from "../../store/pending-edit-profile-form-draft-store";
import { usePendingFormRegionStore } from "../../store/pending-form-region-store";
import { useAuthStore } from "../../store/auth-store";
import { EditProfilePage } from "./edit-profile-page";

const initialAuthState = useAuthStore.getState();
const initialPendingRegionState = usePendingFormRegionStore.getState();
const initialPendingEditProfileDraftState = usePendingEditProfileFormDraftStore.getState();

const sampleProfile = {
  displayName: "小明",
  avatarUrl: null,
  bio: "热爱生活",
  locationId: "loc-1",
  locationName: "Rockville",
  age: 25
};

/**
 * design_handoff_saminest_ios 第 6 项 gap #3：跟
 * publish-page.region-navigation.test.tsx / create-activity-page.
 * region-navigation.test.tsx 是同一个道理——edit-profile-page.test.tsx
 * 里 useNavigate 整个 mock 成空壳 spy，点"常驻地区"只是记录一次调用，
 * 从来不会真的导航，测不出"组件被真实卸载重挂载后字段是不是还在"这个
 * 27 号卡同款 bug。这里用真正的 MemoryRouter + 两条真实路由，
 * /region-select 同样用极简替身。
 */
function FakeRegionSelectStep() {
  const navigate = useNavigate();

  useEffect(() => {
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
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
      <MemoryRouter initialEntries={["/profile/edit"]}>
        <Routes>
          <Route path="/profile/edit" element={<EditProfilePage />} />
          <Route path="/region-select" element={<FakeRegionSelectStep />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EditProfilePage — real navigation round-trip through /region-select (design_handoff_saminest_ios 第 6 项 gap #3)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePendingFormRegionStore.setState(initialPendingRegionState, true);
    usePendingEditProfileFormDraftStore.setState(initialPendingEditProfileDraftState, true);

    useMyProfileQuery.mockReset();
    useUpdateProfileMutation.mockReset();
    listActiveActivityRegions.mockReset();
    mutateAsyncMock.mockReset();
    uploadAvatarMock.mockReset();
    removeAvatarFileMock.mockReset();
    updateMyAvatarUrl.mockReset();

    useMyProfileQuery.mockReturnValue({
      data: sampleProfile,
      isPending: false,
      isError: false
    });
    useUpdateProfileMutation.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
    listActiveActivityRegions.mockResolvedValue([{ id: "loc-ca", name: "CA", stateCode: "CA" }]);
  });

  it("keeps an in-progress edit to 昵称/简介 after a real navigation round-trip through 常驻地区选择", async () => {
    renderWithRealRouting();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "小红" } });
    fireEvent.change(screen.getByLabelText(/简介/), { target: { value: "改过的简介" } });

    // 点"常驻地区"——真实路由跳转，EditProfilePage 会真的卸载，
    // FakeRegionSelectStep 挂载后立刻写回选中结果并 navigate(-1)，
    // EditProfilePage 重新挂载。
    fireEvent.click(screen.getByText("Rockville"));

    // 地区字段本身靠 pendingRegion 这个页面外部的 store 回填，先确认跳转+
    // 返回这个流程本身真的完整跑通。
    expect(await screen.findByText("CA 加利福尼亚州")).toBeInTheDocument();

    // 这才是这次要修的 bug：昵称/简介在改版前会被组件重新挂载后从
    // useMyProfileQuery 拉到的服务端原始值悄悄冲掉，改版后应该原样保留。
    expect(screen.getByLabelText("昵称")).toHaveValue("小红");
    expect(screen.getByLabelText(/简介/)).toHaveValue("改过的简介");
  });

  it("still submits successfully (normal save flow is not broken) after the round-trip", async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    renderWithRealRouting();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "小红" } });

    fireEvent.click(screen.getByText("Rockville"));
    await screen.findByText("CA 加利福尼亚州");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: "小红",
          locationId: "loc-ca"
        })
      );
    });
  });
});
