/**
 * 08 号卡（地区选择扩展到全美 50 州）：全美 50 州 + 华盛顿特区，共 51 项，
 * 静态写死在代码里——任务卡原话"作为静态参考数据源写死在代码里，不需要
 * 额外接口或第三方地址库"，不是从 locations 表查出来的。
 *
 * 这跟 locations 表里已有的 3 条 type = 'state' 行（DC/VA/MD，见
 * use-activity-regions-query.ts）是两个不同的概念：那 3 条行是"活动
 * 发起/筛选真正能选、数据库里有具体城市数据支撑"的州，这里的 51 项是
 * "地区选择页展示给用户看、覆盖全美范围"的完整清单——两者的交集（目前是
 * DC/VA/MD）才是"点了会下钻到具体城市"的州，其余 47 项目前没有对应的
 * locations 城市数据，直接选中整个州、没有下钻，见 region-select-page.tsx
 * 的 buildStateRows()。
 *
 * 顺序已经按英文州名做好 A-Z 排列（DC 按"District of Columbia"这个全名
 * 排在 Delaware 和 Florida 之间，不是排在末尾或者按缩写"DC"排）——这是
 * 「按字母」排序模式下的展示顺序；region-select-page.tsx 的「按热度」模式
 * 会在运行时按当前内容数量重新排序，不依赖这个数组本身的声明顺序，所以
 * 这里维持 A-Z 顺序纯粹是为了这份参考数据本身可读、好核对，不是排序逻辑
 * 依赖的隐含契约。
 */
export interface UsState {
  /** 两字母缩写，如 "VA"——跟 locations 表 state_code 列、
   *  useSelectedRegionStore 的 stateCode 字段是同一套取值（现有的 DC/VA/MD
   *  三个值不变，只是这里补全了其余 48 个）。 */
  code: string;
  /** 标准英文全名，如 "Virginia"；华盛顿特区用 "District of Columbia"
   *  （不是 "Washington, DC"，那是 locations 表里具体城市的名字，两者是
   *  不同层级的概念，即使 DC 这个州只有这一个城市）。 */
  name: string;
}

export const US_STATES: UsState[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" }
];
