import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  useMyProfileQuery,
  useUpdateProfileMutation,
  listActiveActivityRegions,
  mutateAsyncMock,
  navigateMock,
  uploadAvatarMock,
  removeAvatarFileMock,
  updateMyAvatarUrl
} = vi.hoisted(() => ({
  useMyProfileQuery: vi.fn(),
  useUpdateProfileMutation: vi.fn(),
  // design_handoff_saminest_ios 第 6 项：地区字段从原生 <select>（靠
  // useLocationsQuery 查 14 个城市）换成跳转 /region-select?mode=form，
  // 跟 publish-page.test.tsx / create-activity-page.test.tsx 一样在
  // repository 层 mock 这个反查函数，不再需要 mock useLocationsQuery。
  listActiveActivityRegions: vi.fn(),
  mutateAsyncMock: vi.fn(),
  navigateMock: vi.fn(),
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
// avatar-storage-service.ts 的 uploadAvatar/removeAvatarFile 走真实
// Supabase 调用，mock 掉；parseAvatarStoragePathFromUrl 是纯函数，用
// importOriginal 保留真实实现，不用重新在这里手写一份解析逻辑的期望值。
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
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { usePendingFormRegionStore } from "../../store/pending-form-region-store";
import { useAuthStore } from "../../store/auth-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { EditProfilePage } from "./edit-profile-page";

const initialAuthState = useAuthStore.getState();
const initialPendingRegionState = usePendingFormRegionStore.getState();

const sampleProfile = {
  displayName: "小明",
  avatarUrl: null,
  bio: "热爱生活",
  locationId: "loc-1",
  locationName: "Rockville",
  age: 25
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function renderPage() {
  return renderWithProviders(<EditProfilePage />);
}

describe("EditProfilePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    useAuthStore.getState().setSession({ user: { id: "user-1" } } as never);
    usePendingFormRegionStore.setState(initialPendingRegionState, true);

    useMyProfileQuery.mockReset();
    useUpdateProfileMutation.mockReset();
    listActiveActivityRegions.mockReset();
    mutateAsyncMock.mockReset();
    navigateMock.mockReset();
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
    updateMyAvatarUrl.mockResolvedValue(undefined);
    removeAvatarFileMock.mockResolvedValue(undefined);
  });

  it("renders the current display name/bio/city/age as initial values", () => {
    renderPage();

    expect(screen.getByLabelText("昵称")).toHaveValue("小明");
    expect(screen.getByLabelText(/简介/)).toHaveValue("热爱生活");
    // design_handoff_saminest_ios 第 6 项：地区字段不再是原生 <select>——
    // 展示文案直接复用服务端已经解析好的 locationName（经过
    // formatLocationDisplayName，见 edit-profile-page.tsx 消费 profile 的
    // effect），这里断言那行按钮上显示的文字，而不是某个表单控件的 value。
    expect(screen.getByText("Rockville")).toBeInTheDocument();
    expect(screen.getByLabelText(/年龄/)).toHaveValue(25);
  });

  // "找搭子详情页改版对齐方案图"任务卡 1：age 为 null（用户从没填过）时，
  // 数字输入框应该回填成空字符串，不是字面量 "null"/"undefined" 这种
  // 明显的 bug 表现。
  it("seeds the age input as empty when the profile's age is null", () => {
    useMyProfileQuery.mockReturnValue({
      data: { ...sampleProfile, age: null },
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByLabelText(/年龄/)).toHaveValue(null);
  });

  // design_handoff_saminest_ios 第 6 项：地区选择从原生下拉换成跳转
  // /region-select?mode=form 整页选择，这里只断言"点了会跳转到对的路径"，
  // 回填逻辑（消费 usePendingFormRegionStore）单独用下面几个测试覆盖，
  // 跟 publish-page.test.tsx 是同一个模式。
  it("navigates to /region-select?mode=form when the 常驻地区 field is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByText("Rockville"));

    expect(navigateMock).toHaveBeenCalledWith("/region-select?mode=form");
  });

  it("shows '不选择地区' when the profile has no saved location", () => {
    useMyProfileQuery.mockReturnValue({
      data: { ...sampleProfile, locationId: null, locationName: null },
      isPending: false,
      isError: false
    });

    renderPage();

    expect(screen.getByText("不选择地区")).toBeInTheDocument();
  });

  it("resolves a state picked via /region-select into a real locationId through regionsByStateCode", async () => {
    renderPage();

    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });

    expect(await screen.findByText("CA 加利福尼亚州")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: "loc-ca" })
      );
    });
  });

  it("clears the picked region back to '不选择地区' when the clear button is clicked", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "清除地区" }));
    expect(screen.getByText("不选择地区")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: null })
      );
    });
  });

  it("shows a validation error and does not call the mutation when the display name is cleared", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("请填写昵称。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a validation error when the display name is longer than 20 characters", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), {
      target: { value: "a".repeat(21) }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("昵称不能超过 20 个字。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a validation error when the bio is longer than 200 characters", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/简介/), {
      target: { value: "a".repeat(201) }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("简介不能超过 200 字。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("calls the mutation with the trimmed displayName/bio, resolved locationId, and parsed age, then navigates to /profile on success", async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "  小红  " } });
    fireEvent.change(screen.getByLabelText(/简介/), { target: { value: "  你好呀  " } });
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
    await screen.findByText("CA 加利福尼亚州");
    fireEvent.change(screen.getByLabelText(/年龄/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        userId: "user-1",
        displayName: "小红",
        bio: "你好呀",
        locationId: "loc-ca",
        age: 30
      });
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/profile");
    });
  });

  it("submits bio: null, locationId: null, and age: null when all three are cleared", async () => {
    mutateAsyncMock.mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText(/简介/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "清除地区" }));
    fireEvent.change(screen.getByLabelText(/年龄/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        userId: "user-1",
        displayName: "小明",
        bio: null,
        locationId: null,
        age: null
      });
    });
  });

  it("shows a validation error and does not call the mutation when age is out of the allowed range", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/年龄/), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("年龄必须在 13 到 120 岁之间。");
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows a generic error message and does not navigate when the mutation rejects", async () => {
    mutateAsyncMock.mockRejectedValue(new Error("network down"));
    renderPage();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "小红" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请稍后重试。");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows a loading status and disables the form while the profile is still loading", () => {
    useMyProfileQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("加载中…");
    expect(screen.getByLabelText("昵称")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("shows an error and disables the form when the profile fails to load", () => {
    useMyProfileQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("用户信息加载失败，请稍后重试。");
    expect(screen.getByLabelText("昵称")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  describe("avatar upload", () => {
    it("uploads the selected file and calls updateMyAvatarUrl with the resulting publicUrl", async () => {
      uploadAvatarMock.mockResolvedValue({
        storagePath: "user-1/new.webp",
        publicUrl: "https://example.com/user-1/new.webp",
        mimeType: "image/webp",
        sizeBytes: 512
      });

      renderPage();

      const file = makeFile("selfie.jpg", "image/jpeg", 1024);
      fireEvent.change(screen.getByLabelText("更换头像"), { target: { files: [file] } });

      await waitFor(() => {
        expect(uploadAvatarMock).toHaveBeenCalledWith({ file, userId: "user-1" });
      });
      await waitFor(() => {
        expect(updateMyAvatarUrl).toHaveBeenCalledWith(
          "user-1",
          "https://example.com/user-1/new.webp"
        );
      });
    });

    it("shows a '头像上传中…' status while the upload is in flight", async () => {
      let resolveUpload: (value: { publicUrl: string }) => void = () => {};
      uploadAvatarMock.mockReturnValue(
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
      );

      renderPage();

      fireEvent.change(screen.getByLabelText("更换头像"), {
        target: { files: [makeFile("selfie.jpg", "image/jpeg", 1024)] }
      });

      expect(await screen.findByText("头像上传中…")).toBeInTheDocument();

      resolveUpload({ publicUrl: "https://example.com/new.webp" });
      await waitFor(() => {
        expect(screen.queryByText("头像上传中…")).not.toBeInTheDocument();
      });
    });

    it("does not call removeAvatarFile when there was no previous avatar", async () => {
      useMyProfileQuery.mockReturnValue({
        data: { ...sampleProfile, avatarUrl: null },
        isPending: false,
        isError: false
      });
      uploadAvatarMock.mockResolvedValue({
        publicUrl: "https://example.com/user-1/new.webp"
      });

      renderPage();
      fireEvent.change(screen.getByLabelText("更换头像"), {
        target: { files: [makeFile("selfie.jpg", "image/jpeg", 1024)] }
      });

      await waitFor(() => {
        expect(updateMyAvatarUrl).toHaveBeenCalled();
      });
      expect(removeAvatarFileMock).not.toHaveBeenCalled();
    });

    it("removes the previous avatar file (parsed from its URL) after a successful upload+update", async () => {
      useMyProfileQuery.mockReturnValue({
        data: {
          ...sampleProfile,
          avatarUrl:
            "https://project.supabase.co/storage/v1/object/public/avatars/user-1/old.webp"
        },
        isPending: false,
        isError: false
      });
      uploadAvatarMock.mockResolvedValue({
        publicUrl: "https://example.com/user-1/new.webp"
      });

      renderPage();
      fireEvent.change(screen.getByLabelText("更换头像"), {
        target: { files: [makeFile("selfie.jpg", "image/jpeg", 1024)] }
      });

      await waitFor(() => {
        expect(removeAvatarFileMock).toHaveBeenCalledWith("user-1/old.webp");
      });
    });

    it("shows an error message when the upload fails, and does not call updateMyAvatarUrl", async () => {
      uploadAvatarMock.mockRejectedValue(new Error("storage down"));

      renderPage();
      fireEvent.change(screen.getByLabelText("更换头像"), {
        target: { files: [makeFile("selfie.jpg", "image/jpeg", 1024)] }
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "头像上传失败，请稍后重试。"
      );
      expect(updateMyAvatarUrl).not.toHaveBeenCalled();
    });

    it("does not show any error when cleaning up the old avatar file fails (best-effort, does not block the already-successful upload)", async () => {
      useMyProfileQuery.mockReturnValue({
        data: {
          ...sampleProfile,
          avatarUrl:
            "https://project.supabase.co/storage/v1/object/public/avatars/user-1/old.webp"
        },
        isPending: false,
        isError: false
      });
      uploadAvatarMock.mockResolvedValue({
        publicUrl: "https://example.com/user-1/new.webp"
      });
      removeAvatarFileMock.mockRejectedValue(new Error("cleanup failed"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderPage();
      fireEvent.change(screen.getByLabelText("更换头像"), {
        target: { files: [makeFile("selfie.jpg", "image/jpeg", 1024)] }
      });

      await waitFor(() => {
        expect(removeAvatarFileMock).toHaveBeenCalled();
      });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });
});
