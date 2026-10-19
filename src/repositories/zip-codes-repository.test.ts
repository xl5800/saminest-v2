import { beforeEach, describe, expect, it, vi } from "vitest";

const { builder, maybeSingleMock, fromMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = maybeSingleMock;
  const fromMock = vi.fn(() => builder);
  return { builder, maybeSingleMock, fromMock };
});

vi.mock("../integrations/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock })
}));

import { lookupZipCode } from "./zip-codes-repository";

describe("lookupZipCode", () => {
  beforeEach(() => {
    fromMock.mockClear();
    builder.select.mockClear();
    builder.eq.mockClear();
    maybeSingleMock.mockReset();
  });

  it("looks the zip code up and maps the row", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { zip: "20850", city: "Rockville", state_code: "MD", latitude: 39.087, longitude: -77.168 },
      error: null
    });

    await expect(lookupZipCode("20850")).resolves.toEqual({
      zip: "20850",
      city: "Rockville",
      stateCode: "MD",
      latitude: 39.087,
      longitude: -77.168
    });
    expect(fromMock).toHaveBeenCalledWith("zip_codes");
    expect(builder.select).toHaveBeenCalledWith("zip, city, state_code, latitude, longitude");
    expect(builder.eq).toHaveBeenCalledWith("zip", "20850");
  });

  it("returns null for an unknown zip code", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    await expect(lookupZipCode("00001")).resolves.toBeNull();
  });

  it("does not query for anything that isn't 5 digits", async () => {
    await expect(lookupZipCode("2085")).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("throws an AppError when the query fails", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(lookupZipCode("20850")).rejects.toMatchObject({ code: "ZIP_CODE_LOOKUP_FAILED" });
  });
});
