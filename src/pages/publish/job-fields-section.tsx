import { ChevronDown } from "lucide-react";

import {
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_PERK_OPTIONS,
  SALARY_UNIT_OPTIONS
} from "../../features/posts/job-fields";

/**
 * 招聘求职任务卡：发布页在招聘 / 求职分类下，用这一块替换原来的"价格（可选）"。
 *
 * - 薪资：数字 + 单位（时薪/日薪/月薪/年薪）。不填数字就是面议，所以不另设
 *   "面议"开关——少一个控件，也不会出现"填了数字又勾了面议"的矛盾状态。
 *   求职帖叫"期望薪资"。
 * - 工作类型：全职 / 兼职 / 全职兼职都可，单选必填（publish-validation.ts 校验）。
 * - 福利：包吃 / 包住 / 可培训，多选，只有招聘帖有。
 *
 * 胶囊按钮的样式跟本页"分类"那排 tab 一样（选中 primary 蓝底白字），输入框
 * 跟本页其它输入框一样（bg-field、focus 浅蓝光晕）。
 */
interface JobFieldsSectionProps {
  isHiring: boolean;
  salary: string;
  onSalaryChange: (value: string) => void;
  salaryUnit: string;
  onSalaryUnitChange: (value: string) => void;
  employmentType: string;
  onEmploymentTypeChange: (value: string) => void;
  perks: string[];
  onPerksChange: (value: string[]) => void;
}

const CHIP_SELECTED =
  "flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold whitespace-nowrap text-white";
const CHIP_IDLE =
  "flex h-9 items-center justify-center rounded-full border border-border bg-card px-4 text-sm whitespace-nowrap text-text-muted";

export function JobFieldsSection({
  isHiring,
  salary,
  onSalaryChange,
  salaryUnit,
  onSalaryUnitChange,
  employmentType,
  onEmploymentTypeChange,
  perks,
  onPerksChange
}: JobFieldsSectionProps) {
  function togglePerk(value: string): void {
    onPerksChange(perks.includes(value) ? perks.filter((perk) => perk !== value) : [...perks, value]);
  }

  return (
    <>
      <div className="mb-4">
        <span id="publish-salary-label" className="mb-2 block text-xs font-semibold text-text">
          {isHiring ? "薪资" : "期望薪资"}
        </span>
        <div className="flex gap-2">
          <span className="relative block flex-1">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-text-muted"
            >
              $
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              aria-labelledby="publish-salary-label"
              value={salary}
              onChange={(event) => onSalaryChange(event.target.value)}
              placeholder="不填即为面议"
              className="w-full rounded-xl bg-field py-3 pl-7 pr-3.5 text-base text-text placeholder:text-text-muted focus:outline-none focus:ring-4 focus:ring-primary-light"
            />
          </span>
          <span className="relative block w-28 shrink-0">
            <select
              aria-label="薪资单位"
              value={salaryUnit}
              onChange={(event) => onSalaryUnitChange(event.target.value)}
              className="w-full appearance-none rounded-xl bg-field px-3.5 py-3 pr-9 text-base text-text focus:outline-none focus:ring-4 focus:ring-primary-light"
            >
              {SALARY_UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              size={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-chevron"
            />
          </span>
        </div>
      </div>

      <div className="mb-4">
        <span id="publish-employment-type-label" className="mb-2 block text-xs font-semibold text-text">
          工作类型
        </span>
        <div role="radiogroup" aria-labelledby="publish-employment-type-label" className="flex flex-wrap gap-2">
          {EMPLOYMENT_TYPE_OPTIONS.map((option) => {
            const selected = option.value === employmentType;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onEmploymentTypeChange(option.value)}
                className={selected ? CHIP_SELECTED : CHIP_IDLE}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {isHiring ? (
        <div className="mb-4">
          <span id="publish-perks-label" className="mb-2 block text-xs font-semibold text-text">
            福利（可选）
          </span>
          <div role="group" aria-labelledby="publish-perks-label" className="flex flex-wrap gap-2">
            {JOB_PERK_OPTIONS.map((option) => {
              const selected = perks.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => togglePerk(option.value)}
                  className={selected ? CHIP_SELECTED : CHIP_IDLE}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
