import { ChevronDown, ChevronRight, MapPin } from "lucide-react";

import { useNearbyLocationStore } from "../../store/nearby-location-store";

/**
 * 首页"附近的二手"任务卡：列表上方的位置条，点了打开选位置的弹层。
 * 设了位置："📍 Rockville 附近 · 50 英里 ⌄"；
 * 没设位置："📍 {州名} · 显示附近的二手 ›"——这是请求定位的唯一入口，
 * 打开 App 时不主动弹任何定位提示。
 */
export function NearbyLocationBar({ regionLabel, onClick }: { regionLabel: string | null; onClick: () => void }) {
  const location = useNearbyLocationStore((s) => s.location);
  const radiusMiles = useNearbyLocationStore((s) => s.radiusMiles);

  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-4 mt-1 flex max-w-[calc(100%-2rem)] items-center gap-1 rounded-full bg-field px-3 py-1.5 text-sm active:bg-surface-pressed"
    >
      <MapPin aria-hidden="true" size={14} className="shrink-0 text-primary" />
      {location ? (
        <>
          <span className="truncate font-medium text-text">{location.label} 附近</span>
          <span className="shrink-0 text-text-muted">· {radiusMiles} 英里</span>
          <ChevronDown aria-hidden="true" size={14} className="shrink-0 text-text-muted" />
        </>
      ) : (
        <>
          {regionLabel ? <span className="shrink-0 text-text-muted">{regionLabel} ·</span> : null}
          <span className="truncate font-medium text-primary">显示附近的二手</span>
          <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-primary" />
        </>
      )}
    </button>
  );
}
