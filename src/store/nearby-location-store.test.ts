import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_NEARBY_RADIUS, useNearbyLocationStore } from "./nearby-location-store";

describe("useNearbyLocationStore", () => {
  beforeEach(() => {
    useNearbyLocationStore.setState({ location: null, radiusMiles: DEFAULT_NEARBY_RADIUS });
  });

  it("starts with no location and a 10-mile radius", () => {
    expect(useNearbyLocationStore.getState().location).toBeNull();
    expect(useNearbyLocationStore.getState().radiusMiles).toBe(10);
  });

  it("keeps only two decimals of the coordinates", () => {
    useNearbyLocationStore.getState().setLocation({
      latitude: 39.087654,
      longitude: -77.168321,
      label: "Rockville",
      source: "gps",
      zip: "20850"
    });
    expect(useNearbyLocationStore.getState().location).toEqual({
      latitude: 39.09,
      longitude: -77.17,
      label: "Rockville",
      source: "gps",
      zip: "20850"
    });
  });

  it("changes the radius and clears the location", () => {
    useNearbyLocationStore.getState().setRadiusMiles(10);
    useNearbyLocationStore.getState().setLocation({ latitude: 1, longitude: 2, label: "x", source: "zip", zip: "00001" });
    useNearbyLocationStore.getState().clearLocation();
    expect(useNearbyLocationStore.getState()).toMatchObject({ location: null, radiusMiles: 10 });
  });
});
