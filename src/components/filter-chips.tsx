/**
 * 列表页顶部的一排小筛选（"全部 / 招聘 / 求职"、"出租 / 求租"）。首页改版时
 * 写在 home-page.tsx 里，首页改成图标入口之后搬到这里，招聘求职页和房屋
 * 租售页共用；样式跟找搭子频道筛选（features/activities/activity-feed.tsx）
 * 保持一致：高 32px、14px 字，选中浅蓝底蓝字，未选中浅灰底。
 */
export function FilterChips<K extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ key: K; label: string }>;
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto px-4 pb-2 pt-3">
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.key)}
            className={`flex h-8 items-center rounded-full px-3.5 text-sm whitespace-nowrap ${
              selected ? "bg-primary-light font-semibold text-primary" : "bg-field text-text-body"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
