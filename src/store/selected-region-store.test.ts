import { beforeEach, describe, expect, it } from "vitest";

import { useSelectedRegionStore } from "./selected-region-store";

const initialState = useSelectedRegionStore.getState();

beforeEach(() => {
  useSelectedRegionStore.setState(initialState, true);
  localStorage.clear();
});

describe("useSelectedRegionStore", () => {
  it("starts with no selected region", () => {
    expect(useSelectedRegionStore.getState().selectedRegion).toBeNull();
  });

  it("setSelectedRegion updates the selected region", () => {
    useSelectedRegionStore.getState().setSelectedRegion({
      cityId: "loc-arlington",
      cityName: "Arlington",
      stateCode: "VA"
    });

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      cityId: "loc-arlington",
      cityName: "Arlington",
      stateCode: "VA"
    });
  });

  it("persists the selected region to localStorage under the saminest-prefixed key", () => {
    useSelectedRegionStore.getState().setSelectedRegion({
      cityId: "loc-dc",
      cityName: "Washington, DC",
      stateCode: "DC"
    });

    const raw = localStorage.getItem("saminest-selected-region");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.selectedRegion).toEqual({
      cityId: "loc-dc",
      cityName: "Washington, DC",
      stateCode: "DC"
    });
  });
});
