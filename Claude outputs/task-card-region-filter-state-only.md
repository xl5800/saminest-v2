# 任务卡：地区筛选栏暂时只精确到州，不做城市下钻

## 对应 worktree
路径：`../saminest-v2-region-filter-state-only`
分支：`feat/region-filter-state-only`（从 `origin/main` 切出）

## 背景

BARRY 确认：以后会做精确到城市的地区筛选，但现在想先让"地区筛选"这个全局入口（首页顶部胶囊、找搭子列表筛选，也就是 `/region-select` 不带 `?mode=form` 的默认场景）收窄成只能选到"州"这一级，暂时不提供城市下钻。

查了代码，这个改动比听起来简单——**不涉及筛选逻辑本身**：`usePostsInfiniteQuery`/`listApprovedPosts`（08 号卡起）筛选内容时本来就只用 `stateCode` 一个字段，`SelectedRegion` 里的 `cityId`/`cityName` 现在纯粹是展示用的（首页胶囊按钮显示"Arlington, VA"还是"Virginia"），不影响任何查询/筛选。这次只需要改 `region-select-page.tsx` 里筛选场景的交互和展示，不用碰 `posts-repository.ts`/`use-posts-query.ts`/`activities-repository.ts` 这些筛选查询本身。

## 范围：只改筛选场景，不碰发布表单场景

`/region-select` 有两种场景，文件里已经用 `isFormMode`（`searchParams.get("mode") === "form"`）区分：
- **筛选场景**（`!isFormMode`，首页顶部胶囊、找搭子列表筛选入口）——这次要收窄成只到州。
- **表单场景**（`isFormMode`，发布租房/求租/二手/发起搭子时选地区）——这次**不动**，下钻到具体城市、自动选中唯一城市这些行为原样保留，BARRY 没有要求改这一块。

## 具体改法：`src/pages/region-select/region-select-page.tsx`

### 1. `handleStateRowClick`（第 245 行附近）

现在的逻辑：
```tsx
function handleStateRowClick(row: StateRow): void {
  if (row.cities.length > 1) {
    setDrilldownCode(row.code);
    return;
  }
  const onlyCity = row.cities[0];
  if (onlyCity) {
    selectCity(onlyCity, row.code);
    return;
  }
  selectState(row);
}
```

筛选场景下（`!isFormMode`），不管这个州在 `locations` 表里有几个城市，点击都应该直接 `selectState(row)`——不触发下钻（`setDrilldownCode`），也不像现在 DC 那样自动帮用户选中"唯一城市"。表单场景（`isFormMode`）维持现在的三段逻辑不变。具体写法可以是在函数开头加一个 `isFormMode` 判断分流，也可以在现有判断外面包一层 `if (isFormMode) { ...现有逻辑... } else { selectState(row); return; }`，按现有代码风格顺手写，不强制某一种写法。

### 2. 下钻箭头（第 382 行附近）

现在：
```tsx
{row.cities.length > 1 ? (
  <ChevronRight aria-hidden="true" size={18} className="text-chevron" />
) : null}
```

筛选场景下这个箭头这次不该出现——所有州的行为都是"直接选中"，视觉上不该暗示"点进去还有下一层"。改成 `!isFormMode ? null : (row.cities.length > 1 ? <ChevronRight .../> : null)`，或者等价写法（`isFormMode && row.cities.length > 1`），只要保证筛选场景下这个条件恒为 false、表单场景行为不变即可。

### 3. 搜索结果（`searchResults` / `matchedCities`，第 184-208 行附近）

现在搜索框会把命中的州和命中的城市合并成一个扁平列表。筛选场景下，`matchedCities` 这部分不应该并入结果——只保留 `matchedStates`。表单场景继续州+城市一起搜，不用改。

### 4. 其它不用动

`handleSelectNationwide`（"全美"选项）、`drilldownGroup`/`drilldownCode` 相关的下钻列表渲染（表单场景还要用）、排序（`sortStateRows`/`sortByMode`）都不受影响，不用改。

## 明确不做的事

- **不改任何筛选查询**——`usePostsInfiniteQuery`/`listApprovedPosts`/`listActivities` 已经只吃 `stateCode`，跟这次改动无关，不用碰。
- **不改 `SelectedRegion` 类型定义 / `useSelectedRegionStore`**——`cityId`/`cityName` 字段继续保留、继续允许为 null，这次只是"筛选场景下不再有交互路径产生非 null 的 cityId"，不是删掉这两个字段的能力。以后要恢复城市下钻，这两个字段和 store 本身不需要改动。
- **不改发布表单场景（`mode=form`）的任何行为**——下钻、自动选中唯一城市、搜索城市，这些在表单场景里原样保留。
- **不改 `locations` 表 / 城市种子数据**——城市数据还在数据库里，只是筛选场景这次不展示/不可选；以后要恢复，直接把这次收窄的判断去掉即可，不需要补数据。
- **不新建"州级"和"城市级"两套并存的展示逻辑**——首页胶囊按钮等展示层已经是"有 cityName 就显示 `{cityName}, {stateCode}`，没有就显示 `stateName`"这套现成逻辑（`cityName` 为 null 时自动落到州名），不用额外改这部分展示代码，筛选场景下 `cityName` 恒为 null 自然就会展示州名。

## 验证要求

- 筛选场景（不带 `?mode=form` 打开 `/region-select`）：VA/MD 这类有多个城市的州，点击后直接写入 `stateCode`（`cityId`/`cityName` 为 null），不进入下钻城市列表；DC 这种只有 1 个城市的州，点击后也是直接选中整个州本身（不是像现在这样自动选中那唯一一个城市）；所有州行右侧都不显示下钻箭头；搜索框输入城市名（比如"Arlington"）搜不到结果，输入州名/两字母缩写/中文州名正常能搜到。
- 表单场景（`/region-select?mode=form`）：行为跟改动前完全一致——手动跑一遍发布租房和发起搭子的地区选择流程，确认下钻、自动选中唯一城市、搜索城市都没有被这次改动影响。
- 首页顶部地区胶囊按钮：筛选场景选中某个州之后，胶囊上展示的是州名（比如"Virginia"），不会再出现"某某市, VA"这种城市展示格式。
- `npm run typecheck && npm run test && npm run build` 全部通过——`region-select-page.test.tsx` 里如果有断言"点击 VA 行进入下钻"、"点击 DC 自动选中那个城市"这类筛选场景下的旧行为的测试，按需改成新行为的断言；表单场景相关的测试不应该需要改动。
