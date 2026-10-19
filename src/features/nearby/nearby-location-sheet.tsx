import { LocateFixed } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { findNearestZipCode } from "../../repositories/nearby-repository";
import { lookupZipCode, ZIP_CODE_PATTERN } from "../../repositories/zip-codes-repository";
import {
  NEARBY_RADIUS_OPTIONS,
  roundCoordinate,
  useNearbyLocationStore
} from "../../store/nearby-location-store";
import { getApproximatePosition, type GeolocationFailure } from "../../utils/geolocation";

const LOCATION_ERROR_MESSAGES: Record<GeolocationFailure, string> = {
  denied: "请在手机设置里允许华邻使用位置，或者输入邮编。",
  unavailable: "暂时无法获取位置，请稍后再试，或者输入邮编。",
  timeout: "获取位置超时，请稍后再试，或者输入邮编。",
  unsupported: "这台设备不支持定位，请输入邮编。"
};

/** 定位成功但附近找不到美国邮编（比如人在国外）时位置条上的名字。 */
const FALLBACK_GPS_LABEL = "我的位置";

/**
 * 首页"附近的二手"任务卡：选位置的底部弹层。
 *
 * - "用我现在的位置"：只有用户点了这个按钮才调用定位，系统权限框也是这时
 *   才弹（苹果要求用到时才请求，也不能先弹一个带"以后再说"的自定义提示）。
 *   拒绝过就只显示一行提示，不再追问。
 * - 输入邮编：用邮编中心点代替定位。
 * - 范围：5 / 10 / 25 / 50 英里，点了立即生效。
 *
 * 外壳（遮罩、圆角、点遮罩 / Esc 关闭、锁背景滚动）沿用 reason-sheet.tsx 等
 * 底部弹层的写法；没有直接用 ReasonSheet，因为那个是"填原因 + 确认"的表单，
 * 内容和按钮都对不上。
 */
export function NearbyLocationSheet({ onClose }: { onClose: () => void }) {
  const radiusMiles = useNearbyLocationStore((s) => s.radiusMiles);
  const setRadiusMiles = useNearbyLocationStore((s) => s.setRadiusMiles);
  const setLocation = useNearbyLocationStore((s) => s.setLocation);

  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipPending, setZipPending] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function handleUseCurrentLocation(): Promise<void> {
    if (locating) return;
    setLocationError(null);
    setLocating(true);
    try {
      const position = await getApproximatePosition();
      const latitude = roundCoordinate(position.latitude);
      const longitude = roundCoordinate(position.longitude);
      // 查城市名失败不影响使用，位置条显示"我的位置"就行。
      const nearest = await findNearestZipCode(latitude, longitude).catch(() => null);
      setLocation({
        latitude,
        longitude,
        label: nearest?.city ?? FALLBACK_GPS_LABEL,
        source: "gps",
        zip: nearest?.zip ?? null
      });
      onClose();
    } catch (cause) {
      const failure = typeof cause === "string" && cause in LOCATION_ERROR_MESSAGES ? (cause as GeolocationFailure) : "unavailable";
      setLocationError(LOCATION_ERROR_MESSAGES[failure]);
    } finally {
      setLocating(false);
    }
  }

  async function handleZipSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (zipPending) return;
    const value = zip.trim();
    setZipError(null);
    if (!ZIP_CODE_PATTERN.test(value)) {
      setZipError("请输入 5 位邮编。");
      return;
    }
    setZipPending(true);
    try {
      const found = await lookupZipCode(value);
      if (!found || found.latitude === undefined || found.longitude === undefined) {
        setZipError("没找到这个邮编，请检查一下。");
        return;
      }
      setLocation({
        latitude: found.latitude,
        longitude: found.longitude,
        label: found.city,
        source: "zip",
        zip: found.zip
      });
      onClose();
    } catch {
      setZipError("邮编查询失败，请稍后重试。");
    } finally {
      setZipPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="选择位置"
      className="fixed inset-0 z-30 flex items-end bg-overlay"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <p className="text-lg font-semibold text-text">看哪里附近的二手</p>

        <button
          type="button"
          onClick={() => void handleUseCurrentLocation()}
          disabled={locating}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          <LocateFixed aria-hidden="true" size={18} />
          {locating ? "正在获取位置…" : "用我现在的位置"}
        </button>
        {locationError ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {locationError}
          </p>
        ) : null}

        <div className="my-4 flex items-center gap-3 text-xs text-text-subtle">
          <span className="h-px flex-1 bg-divider" />
          或者输入邮编
          <span className="h-px flex-1 bg-divider" />
        </div>

        <form onSubmit={(event) => void handleZipSubmit(event)} noValidate className="flex gap-2">
          <input
            aria-label="邮编"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={zip}
            onChange={(event) => setZip(event.target.value.replace(/\D/g, ""))}
            placeholder="比如 20850"
            className="min-w-0 flex-1 rounded-full border border-border bg-field px-4 py-2.5 text-base text-text outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={zipPending}
            className="shrink-0 rounded-full border border-primary px-5 text-sm font-semibold text-primary disabled:opacity-60"
          >
            {zipPending ? "查询中…" : "确定"}
          </button>
        </form>
        {zipError ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {zipError}
          </p>
        ) : null}

        <p className="mt-5 text-sm font-medium text-text">范围</p>
        <div role="radiogroup" aria-label="范围" className="mt-2 flex gap-2">
          {NEARBY_RADIUS_OPTIONS.map((option) => {
            const selected = option === radiusMiles;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRadiusMiles(option)}
                className={`flex-1 rounded-full py-2 text-sm ${
                  selected ? "bg-primary-light font-semibold text-primary" : "bg-field text-text-body"
                }`}
              >
                {option} 英里
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-text-subtle">位置只保存在这台手机上，不会公开。</p>
      </div>
    </div>
  );
}
