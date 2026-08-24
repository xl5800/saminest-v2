import { beforeEach, describe, expect, it } from "vitest";

import { usePendingFormRegionStore } from "./pending-form-region-store";

const initialState = usePendingFormRegionStore.getState();

beforeEach(() => {
  usePendingFormRegionStore.setState(initialState, true);
});

describe("usePendingFormRegionStore", () => {
  it("starts with no pending region", () => {
    expect(usePendingFormRegionStore.getState().pendingRegion).toBeNull();
  });

  it("setPendingRegion stores a state-only selection with null cityId/cityName", () => {
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });

    expect(usePendingFormRegionStore.getState().pendingRegion).toEqual({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
  });

  it("setPendingRegion stores a city-level selection", () => {
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });

    expect(usePendingFormRegionStore.getState().pendingRegion).toEqual({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });
  });

  it("clearPendingRegion resets it back to null", () => {
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });

    usePendingFormRegionStore.getState().clearPendingRegion();

    expect(usePendingFormRegionStore.getState().pendingRegion).toBeNull();
  });

  // 不用 persist 中间件——只是页面间一次性交接数据，不应该在 localStorage
  // 里留一份，见 store 顶部注释。
  it("does not persist to localStorage", () => {
    usePendingFormRegionStore.getState().setPendingRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: null,
      cityName: null
    });

    expect(localStorage.getItem("saminest-pending-form-region")).toBeNull();
  });
});
