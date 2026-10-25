/**
 * 招聘求职任务卡：工作帖（招聘 hiring / 求职 job-seeking 两个分类）的结构化
 * 字段，以及它们在界面上的中文文案。数据库这三列的取值范围见
 * supabase/migrations/20261018170000_add_job_categories_and_fields.sql，这里的
 * 选项列表必须跟那里的 check 约束一致。
 *
 * 薪资数字沿用 posts.price_amount，"面议"沿用 posts.price_label（现有的
 * formatPrice 已经是"有 price_label 就显示它"），所以这里不另起薪资列。
 */
export const HIRING_CATEGORY_SLUG = "hiring";
export const JOB_SEEKING_CATEGORY_SLUG = "job-seeking";
export const JOB_CATEGORY_SLUGS = [HIRING_CATEGORY_SLUG, JOB_SEEKING_CATEGORY_SLUG] as const;

export function isJobCategorySlug(slug: string | null | undefined): boolean {
  return slug === HIRING_CATEGORY_SLUG || slug === JOB_SEEKING_CATEGORY_SLUG;
}

export type SalaryUnit = "hour" | "day" | "week" | "month" | "year";
export type EmploymentType = "full_time" | "part_time" | "either";
export type JobPerk = "meals" | "housing" | "training";

export const SALARY_UNIT_OPTIONS: Array<{ value: SalaryUnit; label: string; suffix: string }> = [
  { value: "hour", label: "时薪", suffix: "/时" },
  { value: "day", label: "日薪", suffix: "/天" },
  { value: "week", label: "周薪", suffix: "/周" },
  { value: "month", label: "月薪", suffix: "/月" },
  { value: "year", label: "年薪", suffix: "/年" }
];

/**
 * 发布页能选的薪资单位：时薪 / 周薪 / 月薪。日薪 / 年薪数据库里还允许（老帖子
 * 显示照旧），但新帖子不再给这两个选项；编辑一条老帖子时，它自己的单位会补在
 * 后面，不会被悄悄改掉。
 */
export const SALARY_UNIT_CHOICES: readonly SalaryUnit[] = ["hour", "week", "month"];

export function salaryUnitChoicesFor(current: string | null | undefined): typeof SALARY_UNIT_OPTIONS {
  return SALARY_UNIT_OPTIONS.filter(
    (option) => SALARY_UNIT_CHOICES.includes(option.value) || option.value === current
  );
}

export const EMPLOYMENT_TYPE_OPTIONS: Array<{ value: EmploymentType; label: string }> = [
  { value: "full_time", label: "全职" },
  { value: "part_time", label: "兼职" },
  { value: "either", label: "全职/兼职" }
];

export const JOB_PERK_OPTIONS: Array<{ value: JobPerk; label: string }> = [
  { value: "meals", label: "包吃" },
  { value: "housing", label: "包住" },
  { value: "training", label: "可培训" }
];

/** "面议"写进 posts.price_label 的固定文案。 */
export const NEGOTIABLE_SALARY_LABEL = "面议";

/** 工作帖要写进 posts 表的字段（发布 / 编辑时一起提交）。 */
export interface JobFieldsInput {
  salaryUnit: SalaryUnit | null;
  employmentType: EmploymentType;
  perks: JobPerk[];
  /** true = 面议：price_amount 为 null，price_label 写"面议"。 */
  negotiable: boolean;
}

export function isSalaryUnit(value: unknown): value is SalaryUnit {
  return SALARY_UNIT_OPTIONS.some((option) => option.value === value);
}

export function isEmploymentType(value: unknown): value is EmploymentType {
  return EMPLOYMENT_TYPE_OPTIONS.some((option) => option.value === value);
}

/** 只保留认识的福利值，顺序按 JOB_PERK_OPTIONS 固定，重复的去掉。 */
export function normalizeJobPerks(values: readonly unknown[] | null | undefined): JobPerk[] {
  const set = new Set(values ?? []);
  return JOB_PERK_OPTIONS.map((option) => option.value).filter((value) => set.has(value));
}

/**
 * 列表和详情页显示的薪资："$18/时"、"$5,500/月"、"面议"。求职帖的薪资是
 * 期望薪资，调用方需要的话自己在前面加"期望"。
 */
export function formatSalary(
  priceAmount: number | null,
  priceLabel: string | null,
  salaryUnit: string | null
): string {
  if (priceLabel) return priceLabel;
  if (priceAmount === null) return NEGOTIABLE_SALARY_LABEL;
  const suffix = SALARY_UNIT_OPTIONS.find((option) => option.value === salaryUnit)?.suffix ?? "";
  return `$${priceAmount.toLocaleString("en-US")}${suffix}`;
}

export function employmentTypeLabel(value: string | null): string | null {
  return EMPLOYMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

export function jobPerkLabels(values: readonly string[] | null | undefined): string[] {
  return normalizeJobPerks(values).map(
    (value) => JOB_PERK_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}
