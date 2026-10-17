import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { capture, identify, reset, init, isNativePlatform } = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  init: vi.fn(),
  isNativePlatform: vi.fn(() => false)
}));

vi.mock("posthog-js", () => ({ default: { capture, identify, reset, init } }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform, getPlatform: () => "web" }
}));

import { useAuthStore } from "../../store/auth-store";

async function loadTrack() {
  vi.resetModules();
  return import("./track");
}

function setHost(hostname: string, search = "") {
  vi.stubGlobal("location", { ...window.location, hostname, search });
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("analytics track", () => {
  beforeEach(() => {
    capture.mockReset();
    identify.mockReset();
    reset.mockReset();
    init.mockReset();
    isNativePlatform.mockReturnValue(false);
    useAuthStore.setState({ session: null });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("stays off in tests / local dev: track() is a no-op and posthog is never loaded", async () => {
    const { initAnalytics, track, isAnalyticsEnabled } = await loadTrack();
    expect(isAnalyticsEnabled()).toBe(false);
    initAnalytics();
    track("community_joined", {});
    await flush();
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  describe("in a production build", () => {
    beforeEach(() => {
      vi.stubEnv("PROD", true);
      vi.stubEnv("MODE", "production");
    });

    it("is off on Vercel preview hosts and on in the App or on saminest.com", async () => {
      const { isAnalyticsEnabled } = await loadTrack();
      setHost("saminest-v2-git-x.vercel.app");
      expect(isAnalyticsEnabled()).toBe(false);
      setHost("www.saminest.com");
      expect(isAnalyticsEnabled()).toBe(true);
      setHost("localhost");
      isNativePlatform.mockReturnValue(true);
      expect(isAnalyticsEnabled()).toBe(true);
    });

    it("inits with autocapture/replay off, records app_opened (from a share link) and replays queued events", async () => {
      setHost("www.saminest.com", "?s=123");
      const { initAnalytics, track } = await loadTrack();
      initAnalytics();
      track("content_viewed", { type: "community_post" });
      await flush();

      expect(init).toHaveBeenCalledWith(
        "phc_vVj597Hnj6rrAXwZ2NZbgeRJxbmtGoYX6WHwMsQua7xz",
        expect.objectContaining({
          autocapture: false,
          disable_session_recording: true,
          person_profiles: "identified_only"
        })
      );
      expect(capture.mock.calls.map((call) => call[0])).toEqual(["app_opened", "content_viewed"]);
      expect(capture.mock.calls[0][1]).toEqual({ from_share_link: true, platform: "web" });
    });

    it("identifies by Supabase user id only, and resets on logout", async () => {
      setHost("www.saminest.com");
      const { initAnalytics } = await loadTrack();
      // resetModules 之后 track.ts 拿到的是一份新的 auth-store，要用同一份。
      const { useAuthStore: freshAuthStore } = await import("../../store/auth-store");
      initAnalytics();
      await flush();

      freshAuthStore.setState({ session: { user: { id: "user-1" } } as never });
      expect(identify).toHaveBeenCalledWith("user-1");
      expect(identify.mock.calls[0]).toHaveLength(1);

      freshAuthStore.setState({ session: null });
      expect(reset).toHaveBeenCalledTimes(1);
    });
  });
});
