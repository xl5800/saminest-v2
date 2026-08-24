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
  /** 中文州名，新华社通用译名，如 "弗吉尼亚州"；华盛顿特区用"哥伦比亚特区"
   *  （12 号卡"地区选择格式统一"新增）——全站展示州名统一改成"缩写 + 空格 +
   *  中文州名"格式（如 "NY 纽约州"），不再单独展示英文全名。译名直接照抄
   *  任务卡给的对照表，不自己另外翻译。 */
  nameZh: string;
}

export const US_STATES: UsState[] = [
  { code: "AL", name: "Alabama", nameZh: "阿拉巴马州" },
  { code: "AK", name: "Alaska", nameZh: "阿拉斯加州" },
  { code: "AZ", name: "Arizona", nameZh: "亚利桑那州" },
  { code: "AR", name: "Arkansas", nameZh: "阿肯色州" },
  { code: "CA", name: "California", nameZh: "加利福尼亚州" },
  { code: "CO", name: "Colorado", nameZh: "科罗拉多州" },
  { code: "CT", name: "Connecticut", nameZh: "康涅狄格州" },
  { code: "DE", name: "Delaware", nameZh: "特拉华州" },
  { code: "DC", name: "District of Columbia", nameZh: "哥伦比亚特区" },
  { code: "FL", name: "Florida", nameZh: "佛罗里达州" },
  { code: "GA", name: "Georgia", nameZh: "佐治亚州" },
  { code: "HI", name: "Hawaii", nameZh: "夏威夷州" },
  { code: "ID", name: "Idaho", nameZh: "爱达荷州" },
  { code: "IL", name: "Illinois", nameZh: "伊利诺伊州" },
  { code: "IN", name: "Indiana", nameZh: "印第安纳州" },
  { code: "IA", name: "Iowa", nameZh: "艾奥瓦州" },
  { code: "KS", name: "Kansas", nameZh: "堪萨斯州" },
  { code: "KY", name: "Kentucky", nameZh: "肯塔基州" },
  { code: "LA", name: "Louisiana", nameZh: "路易斯安那州" },
  { code: "ME", name: "Maine", nameZh: "缅因州" },
  { code: "MD", name: "Maryland", nameZh: "马里兰州" },
  { code: "MA", name: "Massachusetts", nameZh: "马萨诸塞州" },
  { code: "MI", name: "Michigan", nameZh: "密歇根州" },
  { code: "MN", name: "Minnesota", nameZh: "明尼苏达州" },
  { code: "MS", name: "Mississippi", nameZh: "密西西比州" },
  { code: "MO", name: "Missouri", nameZh: "密苏里州" },
  { code: "MT", name: "Montana", nameZh: "蒙大拿州" },
  { code: "NE", name: "Nebraska", nameZh: "内布拉斯加州" },
  { code: "NV", name: "Nevada", nameZh: "内华达州" },
  { code: "NH", name: "New Hampshire", nameZh: "新罕布什尔州" },
  { code: "NJ", name: "New Jersey", nameZh: "新泽西州" },
  { code: "NM", name: "New Mexico", nameZh: "新墨西哥州" },
  { code: "NY", name: "New York", nameZh: "纽约州" },
  { code: "NC", name: "North Carolina", nameZh: "北卡罗来纳州" },
  { code: "ND", name: "North Dakota", nameZh: "北达科他州" },
  { code: "OH", name: "Ohio", nameZh: "俄亥俄州" },
  { code: "OK", name: "Oklahoma", nameZh: "俄克拉荷马州" },
  { code: "OR", name: "Oregon", nameZh: "俄勒冈州" },
  { code: "PA", name: "Pennsylvania", nameZh: "宾夕法尼亚州" },
  { code: "RI", name: "Rhode Island", nameZh: "罗德岛州" },
  { code: "SC", name: "South Carolina", nameZh: "南卡罗来纳州" },
  { code: "SD", name: "South Dakota", nameZh: "南达科他州" },
  { code: "TN", name: "Tennessee", nameZh: "田纳西州" },
  { code: "TX", name: "Texas", nameZh: "得克萨斯州" },
  { code: "UT", name: "Utah", nameZh: "犹他州" },
  { code: "VT", name: "Vermont", nameZh: "佛蒙特州" },
  { code: "VA", name: "Virginia", nameZh: "弗吉尼亚州" },
  { code: "WA", name: "Washington", nameZh: "华盛顿州" },
  { code: "WV", name: "West Virginia", nameZh: "西弗吉尼亚州" },
  { code: "WI", name: "Wisconsin", nameZh: "威斯康星州" },
  { code: "WY", name: "Wyoming", nameZh: "怀俄明州" }
];

/** "缩写 + 空格 + 中文州名"（如 "NY 纽约州"）——12 号卡统一的州名展示格式，
 *  全站所有展示州名的地方（地区选择页列表、首页顶部胶囊、帖子/活动卡片
 *  地区标签、详情页地区展示）都用这一个函数产出文案，不在各处重复拼接，
 *  避免以后格式又变成各处各写各的。 */
export function formatStateLabel(state: Pick<UsState, "code" | "nameZh">): string {
  return `${state.code} ${state.nameZh}`;
}

/** 按两字母缩写反查中文州名格式——给只有 stateCode 字符串、没有完整 UsState
 *  对象的调用点用（比如 DB 查询结果里的 state_code 列）。查不到时退回
 *  code 本身，不抛错、不显示空字符串——理论上不会发生（51 项覆盖全美），
 *  但防御性地处理未来可能出现的脏数据/超出范围的输入。 */
export function formatStateLabelByCode(code: string): string {
  const state = US_STATES.find((candidate) => candidate.code === code);
  return state ? formatStateLabel(state) : code;
}

/** 展示层兜底：locationName 这类"服务端联表查出来的地区展示名"里，如果
 *  恰好是一个裸的两字母州代码（目前只有活动的"州"选择会出现——发起活动的
 *  location_id 引用的是 locations 表里 type = 'state' 的行，这些行的 name
 *  列历史上就是存的裸缩写 "DC"/"VA"/"MD"，见
 *  supabase/migrations/20260816223226_add_activity_region_locations.sql），
 *  统一换成 "缩写 中文州名"；不是这个模式（正常城市名，如 "Arlington"，
 *  或帖子表单新流程里已经拼好的 "VA 弗吉尼亚州" 这种 locationText）原样
 *  返回，不做任何改动——用"是不是恰好等于某个已知两字母州代码"这个特征
 *  判断，这个体量下（14 条城市数据，没有任何城市名是两字母全大写）已经
 *  够用，不需要额外查 type 列才能区分。 */
export function formatLocationDisplayName(name: string): string {
  const isBareStateCode = /^[A-Z]{2}$/.test(name) && US_STATES.some((state) => state.code === name);
  return isBareStateCode ? formatStateLabelByCode(name) : name;
}
