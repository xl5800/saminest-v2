import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativePlatformMock, getPlatformMock, httpGetMock } = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
  getPlatformMock: vi.fn(),
  httpGetMock: vi.fn()
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock, getPlatform: getPlatformMock },
  CapacitorHttp: { get: httpGetMock }
}));

import {
  checkForAppUpdate,
  compareVersions,
  dismissAppUpdate,
  toAppStoreAppUrl
} from "./app-update-check";

function lookupResponse(version: string) {
  return {
    status: 200,
    data: {
      resultCount: 1,
      results: [
        {
          version,
          trackViewUrl: "https://apps.apple.com/us/app/saminest/id123?uo=4",
          releaseNotes: "修复了一些问题"
        }
      ]
    }
  };
}

describe("compareVersions", () => {
  it("compares dotted versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.3")).toBeLessThan(0);
  });
});

describe("toAppStoreAppUrl", () => {
  it("switches the https link to the itms-apps scheme", () => {
    expect(toAppStoreAppUrl("https://apps.apple.com/us/app/x/id1")).toBe(
      "itms-apps://apps.apple.com/us/app/x/id1"
    );
  });
});

describe("checkForAppUpdate", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.0");
    isNativePlatformMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue("ios");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not hit the network outside the iOS native shell", async () => {
    isNativePlatformMock.mockReturnValue(false);
    expect(await checkForAppUpdate()).toBeNull();
    expect(httpGetMock).not.toHaveBeenCalled();
  });

  it("skips the check when the build has no version number", async () => {
    vi.stubEnv("VITE_APP_VERSION", "");
    expect(await checkForAppUpdate()).toBeNull();
    expect(httpGetMock).not.toHaveBeenCalled();
  });

  it("returns update info when the App Store has a newer version", async () => {
    httpGetMock.mockResolvedValue(lookupResponse("1.3.0"));
    expect(await checkForAppUpdate()).toEqual({
      latestVersion: "1.3.0",
      storeUrl: "https://apps.apple.com/us/app/saminest/id123?uo=4",
      releaseNotes: "修复了一些问题"
    });
  });

  it("parses a string response body (text/javascript content type)", async () => {
    const res = lookupResponse("1.3.0");
    httpGetMock.mockResolvedValue({ ...res, data: JSON.stringify(res.data) });
    expect((await checkForAppUpdate())?.latestVersion).toBe("1.3.0");
  });

  it("returns null when already on the latest version", async () => {
    httpGetMock.mockResolvedValue(lookupResponse("1.2.0"));
    expect(await checkForAppUpdate()).toBeNull();
  });

  it("does not nag again for a version the user dismissed, but does for a newer one", async () => {
    dismissAppUpdate("1.3.0");
    httpGetMock.mockResolvedValue(lookupResponse("1.3.0"));
    expect(await checkForAppUpdate()).toBeNull();

    httpGetMock.mockResolvedValue(lookupResponse("1.4.0"));
    expect((await checkForAppUpdate())?.latestVersion).toBe("1.4.0");
  });

  it("swallows network errors", async () => {
    httpGetMock.mockRejectedValue(new Error("offline"));
    expect(await checkForAppUpdate()).toBeNull();
  });

  it("returns null when the app is not found in the store", async () => {
    httpGetMock.mockResolvedValue({ status: 200, data: { resultCount: 0, results: [] } });
    expect(await checkForAppUpdate()).toBeNull();
  });
});
