import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: {}, from: vi.fn() }))
}));

async function freshClientModule() {
  vi.resetModules();
  return import("./client");
}

describe("getSupabaseClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("throws a clear error when env vars are missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const { getSupabaseClient } = await freshClientModule();

    expect(() => getSupabaseClient()).toThrow(
      /VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/
    );
  });

  it("creates exactly one client instance across repeated calls", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    const { createClient } = await import("@supabase/supabase-js");
    const { getSupabaseClient } = await freshClientModule();

    const first = getSupabaseClient();
    const second = getSupabaseClient();

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledOnce();
  });
});
