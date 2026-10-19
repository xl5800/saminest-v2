import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 首页"附近的二手"任务卡：范围选项（英里），默认 50。 */
export const NEARBY_RADIUS_OPTIONS = [5, 10, 25, 50] as const;
export type NearbyRadius = (typeof NEARBY_RADIUS_OPTIONS)[number];
export const DEFAULT_NEARBY_RADIUS: NearbyRadius = 50;

export interface NearbyLocation {
  /** 只保留两位小数（约 1 公里），不需要也不保存精确位置。 */
  latitude: number;
  longitude: number;
  /** 位置条上显示的地名，比如 "Rockville, MD"。 */
  label: string;
  source: "gps" | "zip";
  zip: string | null;
}

interface NearbyLocationState {
  location: NearbyLocation | null;
  radiusMiles: NearbyRadius;
  setLocation: (location: NearbyLocation) => void;
  clearLocation: () => void;
  setRadiusMiles: (radius: NearbyRadius) => void;
}

/** 坐标保留两位小数（约 1 公里）。 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 首页"附近的二手"用的位置（手机定位或用户输入的邮编）和范围。跟
 * selected-region-store 一样只存在这台手机上（persist → localStorage），
 * 不写进服务器、不跟账号关联——用户位置只在查询附近帖子时作为参数传过去。
 */
export const useNearbyLocationStore = create<NearbyLocationState>()(
  persist(
    (set) => ({
      location: null,
      radiusMiles: DEFAULT_NEARBY_RADIUS,
      setLocation: (location) =>
        set({
          location: {
            ...location,
            latitude: roundCoordinate(location.latitude),
            longitude: roundCoordinate(location.longitude)
          }
        }),
      clearLocation: () => set({ location: null }),
      setRadiusMiles: (radiusMiles) => set({ radiusMiles })
    }),
    { name: "saminest-nearby-location" }
  )
);
