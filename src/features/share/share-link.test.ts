import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativePlatform, capacitorShare } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  capacitorShare: vi.fn()
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform } }));
vi.mock("@capacitor/share", () => ({ Share: { share: capacitorShare } }));

import { shareLink } from "./share-link";

const input = { title: "周末吃火锅", text: "10-24 19:00", url: "https://www.saminest.com/activities/a1" };
const WECHAT_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 MicroMessenger/8.0.50";

describe("shareLink", () => {
  const originalUA = navigator.userAgent;

  beforeEach(() => {
    isNativePlatform.mockReset().mockReturnValue(false);
    capacitorShare.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, configurable: true });
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  it("uses the native share sheet inside the App", async () => {
    isNativePlatform.mockReturnValue(true);
    await expect(shareLink(input)).resolves.toBe("shared");
    expect(capacitorShare).toHaveBeenCalledWith({ ...input, dialogTitle: "分享" });
  });

  it("asks the page to show the 右上角转发 guide inside WeChat, without calling any share API", async () => {
    Object.defineProperty(navigator, "userAgent", { value: WECHAT_UA, configurable: true });
    const webShare = vi.fn();
    Object.defineProperty(navigator, "share", { value: webShare, configurable: true });

    await expect(shareLink(input)).resolves.toBe("wechat-guide");
    expect(webShare).not.toHaveBeenCalled();
    expect(capacitorShare).not.toHaveBeenCalled();
  });

  it("uses navigator.share in mobile browsers that support it", async () => {
    const webShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: webShare, configurable: true });

    await expect(shareLink(input)).resolves.toBe("shared");
    expect(webShare).toHaveBeenCalledWith(input);
  });

  it("copies the link when no share API is available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await expect(shareLink(input)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(input.url);
  });
});
