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
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });
  });

  // 08 号卡：全美 50 州展开后，大多数州在 locations 表里没有对应的城市
  // 数据，选中这些州时 cityId/cityName 必须能是 null（不是被迫伪造一个
  // 假的城市 id）。
  it("setSelectedRegion accepts a state-only selection with null cityId/cityName", () => {
    useSelectedRegionStore.getState().setSelectedRegion({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });

    expect(useSelectedRegionStore.getState().selectedRegion).toEqual({
      stateCode: "CA",
      stateName: "California",
      cityId: null,
      cityName: null
    });
  });

  it("persists the selected region to localStorage under the saminest-prefixed key", () => {
    useSelectedRegionStore.getState().setSelectedRegion({
      stateCode: "DC",
      stateName: "District of Columbia",
      cityId: "loc-dc",
      cityName: "Washington, DC"
    });

    const raw = localStorage.getItem("saminest-selected-region");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.selectedRegion).toEqual({
      stateCode: "DC",
      stateName: "District of Columbia",
      cityId: "loc-dc",
      cityName: "Washington, DC"
    });
  });

  // 08 号卡新增：地区选择页顶部的「全美」选项用这个 action 清除已选地区，
  // 是 06 号卡没有覆盖的"取消选择"能力。
  it("clearSelectedRegion resets the selected region back to null", () => {
    useSelectedRegionStore.getState().setSelectedRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });
    expect(useSelectedRegionStore.getState().selectedRegion).not.toBeNull();

    useSelectedRegionStore.getState().clearSelectedRegion();

    expect(useSelectedRegionStore.getState().selectedRegion).toBeNull();
  });

  it("clearSelectedRegion also persists the cleared state to localStorage", () => {
    useSelectedRegionStore.getState().setSelectedRegion({
      stateCode: "VA",
      stateName: "Virginia",
      cityId: "loc-arlington",
      cityName: "Arlington"
    });
    useSelectedRegionStore.getState().clearSelectedRegion();

    const raw = localStorage.getItem("saminest-selected-region");
    expect(JSON.parse(raw as string).state.selectedRegion).toBeNull();
  });
});
