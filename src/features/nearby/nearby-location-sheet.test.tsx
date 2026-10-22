import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getApproximatePosition, findNearestZipCode, lookupZipCode } = vi.hoisted(() => ({
  getApproximatePosition: vi.fn(),
  findNearestZipCode: vi.fn(),
  lookupZipCode: vi.fn()
}));

vi.mock("../../utils/geolocation", () => ({ getApproximatePosition }));
vi.mock("../../repositories/nearby-repository", () => ({ findNearestZipCode }));
vi.mock("../../repositories/zip-codes-repository", () => ({ lookupZipCode, ZIP_CODE_PATTERN: /^\d{5}$/ }));

import { DEFAULT_NEARBY_RADIUS, useNearbyLocationStore } from "../../store/nearby-location-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { NearbyLocationSheet } from "./nearby-location-sheet";

describe("NearbyLocationSheet", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    useNearbyLocationStore.setState({ location: null, radiusMiles: DEFAULT_NEARBY_RADIUS });
    getApproximatePosition.mockReset();
    findNearestZipCode.mockReset();
    lookupZipCode.mockReset();
    onClose.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("asks for the location only when 用我现在的位置 is tapped, then saves a rounded position", async () => {
    getApproximatePosition.mockResolvedValue({ latitude: 39.087654, longitude: -77.168321 });
    findNearestZipCode.mockResolvedValue({ zip: "20850", city: "Rockville", stateCode: "MD" });
    renderWithProviders(<NearbyLocationSheet onClose={onClose} />);

    expect(getApproximatePosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "用我现在的位置" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(findNearestZipCode).toHaveBeenCalledWith(39.09, -77.17);
    expect(useNearbyLocationStore.getState().location).toEqual({
      latitude: 39.09,
      longitude: -77.17,
      label: "Rockville",
      source: "gps",
      zip: "20850"
    });
  });

  it("shows one line about settings when the permission is denied, and keeps the sheet open", async () => {
    getApproximatePosition.mockRejectedValue("denied");
    renderWithProviders(<NearbyLocationSheet onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "用我现在的位置" }));

    expect(await screen.findByText("请在手机设置里允许华邻使用位置，或者输入邮编。")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(useNearbyLocationStore.getState().location).toBeNull();
  });

  it("still works when the city lookup fails after locating", async () => {
    getApproximatePosition.mockResolvedValue({ latitude: 39.08, longitude: -77.15 });
    findNearestZipCode.mockRejectedValue(new Error("boom"));
    renderWithProviders(<NearbyLocationSheet onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "用我现在的位置" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useNearbyLocationStore.getState().location).toMatchObject({ label: "我的位置", zip: null });
  });

  it("uses the zip code's center when a zip code is entered", async () => {
    lookupZipCode.mockResolvedValue({ zip: "22030", city: "Fairfax", stateCode: "VA", latitude: 38.85, longitude: -77.3 });
    renderWithProviders(<NearbyLocationSheet onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("邮编"), { target: { value: "22030" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useNearbyLocationStore.getState().location).toEqual({
      latitude: 38.85,
      longitude: -77.3,
      label: "Fairfax",
      source: "zip",
      zip: "22030"
    });
    expect(getApproximatePosition).not.toHaveBeenCalled();
  });

  it("rejects a short zip code and an unknown one", async () => {
    renderWithProviders(<NearbyLocationSheet onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("邮编"), { target: { value: "220" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(await screen.findByText("请输入 5 位邮编。")).toBeInTheDocument();
    expect(lookupZipCode).not.toHaveBeenCalled();

    lookupZipCode.mockResolvedValue(null);
    fireEvent.change(screen.getByLabelText("邮编"), { target: { value: "00001" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(await screen.findByText("没找到这个邮编，请检查一下。")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("changes the radius right away, defaulting to 10 miles", () => {
    renderWithProviders(<NearbyLocationSheet onClose={onClose} />);

    expect(screen.getByRole("radio", { name: "10 英里" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "25 英里" }));
    expect(useNearbyLocationStore.getState().radiusMiles).toBe(25);
    expect(screen.getByRole("radio", { name: "25 英里" })).toHaveAttribute("aria-checked", "true");
  });
});
