import { afterEach, describe, expect, it, vi } from "vitest";

const {
  isNativePlatformMock,
  setOverlaysWebViewMock,
  setStyleMock,
  hideMock,
  addListenerMock,
  startSplashScreenFallbackMock
} = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
  setOverlaysWebViewMock: vi.fn(),
  setStyleMock: vi.fn(),
  hideMock: vi.fn(),
  addListenerMock: vi.fn(),
  startSplashScreenFallbackMock: vi.fn()
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock }
}));
vi.mock("@capacitor/keyboard", () => ({
  Keyboard: { addListener: addListenerMock }
}));
vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: hideMock }
}));
vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setOverlaysWebView: setOverlaysWebViewMock, setStyle: setStyleMock },
  Style: { Light: "LIGHT" }
}));

vi.mock("./splash-screen", () => ({
  startSplashScreenFallback: startSplashScreenFallbackMock
}));

import { initializeMobileShell } from "./mobile-bootstrap";

// 消息输入框卡在屏幕中间任务卡：这里只能验证"原生环境下有没有正确注册
// keyboardDidHide 监听、注册的回调有没有调用 window.scrollTo(0, 0)"这些
// 纯 JS 逻辑——jsdom 模拟不出真实 WKWebView 键盘收起时的可视区域 resize
// 行为，"输入框是否真的会回到屏幕底部"这一条必须靠真机/模拟器手动验证，
// 不能靠这份单测下结论，见完工报告"剩余风险"。
describe("initializeMobileShell", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing (no plugin calls at all) when not running in a native shell", async () => {
    isNativePlatformMock.mockReturnValue(false);

    await initializeMobileShell();

    expect(setOverlaysWebViewMock).not.toHaveBeenCalled();
    expect(setStyleMock).not.toHaveBeenCalled();
    expect(addListenerMock).not.toHaveBeenCalled();
    expect(hideMock).not.toHaveBeenCalled();
    expect(startSplashScreenFallbackMock).not.toHaveBeenCalled();
  });

  // 启动图不再在这里立刻收起：只开始兜底计时，真正收起等首页第一屏数据
  // （见 splash-screen.ts），兜底计时本身的行为在 splash-screen.test.ts 里测。
  it("sets up the status bar and starts the splash fallback timer, without hiding the splash screen right away", async () => {
    isNativePlatformMock.mockReturnValue(true);
    addListenerMock.mockResolvedValue({ remove: vi.fn() });

    await initializeMobileShell();

    expect(setOverlaysWebViewMock).toHaveBeenCalledWith({ overlay: true });
    expect(setStyleMock).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(hideMock).not.toHaveBeenCalled();
    expect(startSplashScreenFallbackMock).toHaveBeenCalledTimes(1);
  });

  it("registers a keyboardDidHide listener (not keyboardWillHide) in a native shell", async () => {
    isNativePlatformMock.mockReturnValue(true);
    addListenerMock.mockResolvedValue({ remove: vi.fn() });

    await initializeMobileShell();

    expect(addListenerMock).toHaveBeenCalledTimes(1);
    expect(addListenerMock).toHaveBeenCalledWith("keyboardDidHide", expect.any(Function));
  });

  it("scrolls back to the top-left of the viewport when the registered keyboardDidHide callback fires", async () => {
    isNativePlatformMock.mockReturnValue(true);
    addListenerMock.mockResolvedValue({ remove: vi.fn() });
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    await initializeMobileShell();

    const [, onKeyboardDidHide] = addListenerMock.mock.calls[0];
    onKeyboardDidHide();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);

    scrollToSpy.mockRestore();
  });
});
