import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativePlatformMock, hideMock } = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
  hideMock: vi.fn()
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock }
}));
vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: hideMock }
}));

import {
  hideSplashScreen,
  resetSplashScreenStateForTests,
  SPLASH_MAX_WAIT_MS,
  startSplashScreenFallback
} from "./splash-screen";

describe("splash-screen", () => {
  beforeEach(() => {
    resetSplashScreenStateForTests();
    isNativePlatformMock.mockReturnValue(true);
    hideMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("hides the native splash screen only once, however many times it is called", () => {
    hideSplashScreen();
    hideSplashScreen();
    hideSplashScreen();

    expect(hideMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the plugin outside a native shell (web version has no splash screen)", () => {
    isNativePlatformMock.mockReturnValue(false);

    hideSplashScreen();

    expect(hideMock).not.toHaveBeenCalled();
  });

  it("hides the splash screen after the max wait when nothing else hid it first", () => {
    vi.useFakeTimers();
    startSplashScreenFallback();

    vi.advanceTimersByTime(SPLASH_MAX_WAIT_MS - 1);
    expect(hideMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(hideMock).toHaveBeenCalledTimes(1);
  });

  it("does not hide a second time when the fallback fires after the page already hid it", () => {
    vi.useFakeTimers();
    startSplashScreenFallback();

    hideSplashScreen();
    vi.advanceTimersByTime(SPLASH_MAX_WAIT_MS * 2);

    expect(hideMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a plugin failure instead of throwing", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    hideMock.mockRejectedValue(new Error("boom"));

    expect(() => hideSplashScreen()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
