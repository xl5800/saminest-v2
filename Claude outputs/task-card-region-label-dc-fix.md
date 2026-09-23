# 任务卡：修复地区选择胶囊按钮"Washington, DC, DC"重复显示（编号留空）

> **对应 worktree**：`C:\Users\32092\Documents\Codex\saminest-v2-dc-region-label`（分支 `fix/dc-region-label-duplicate`）——只碰 `us-states.ts`，跟其它三张卡都没有文件交集，可以随时并行开工，不用等其它卡。

## 背景（根因，已读代码确认）

首页/找搭子列表页顶部胶囊按钮第二行的地区文案，由 `src/data/us-states.ts` 的 `formatSelectedRegionLabel` 产出：

```ts
export function formatSelectedRegionLabel(region: {
  stateCode: string;
  stateName: string;
  cityName: string | null;
}): string {
  return region.cityName ? `${region.cityName}, ${region.stateCode}` : formatStateLabelByCode(region.stateCode);
}
```

有 `cityName` 时拼成 `"{城市名}, {州代码}"`（比如 `"Woodbridge, VA"`）。但 `locations` 表里 DC 这条城市记录的 `name` 列存的就是完整字符串 `"Washington, DC"`（不是单纯的 `"Washington"`），所以用户选中 DC 时，`cityName` 本身已经是 `"Washington, DC"`，再跟 `stateCode`（`"DC"`）拼一次，变成 `"Washington, DC, DC"`。

这是一个真 bug，不是"展示逻辑设计得不对"——`formatSelectedRegionLabel` 这个拼接规则对其它城市（`cityName` 是单纯地名，比如 `"Woodbridge"`）完全正确，只有 DC 这一条数据的 `cityName` 本身已经带着州代码，才会撞上这个重复。

**范围明确限定**：这张卡只解决"显示两个 DC"这一个具体问题，只改 `formatSelectedRegionLabel` 这一个函数内部的字符串拼接逻辑。不要顺带调整胶囊按钮、地区选择页、或者任何用到这个函数的地方的布局/样式/间距/交互——现在的 UI 除了 DC 这一种情况文案重复之外，其它都是对的，不需要重新设计。

## 修法：防御性地跳过重复拼接（选定方案，不改数据库数据）

在 `formatSelectedRegionLabel` 里加一道判断：如果 `cityName` 已经以 `", {stateCode}"` 结尾，就不再重复拼一次，直接用 `cityName` 本身；否则维持现在的拼接方式。大致形状（具体写法你/Codex 可以按项目里已有的字符串处理习惯来，这里只是示意逻辑）：

```ts
export function formatSelectedRegionLabel(region: {
  stateCode: string;
  stateName: string;
  cityName: string | null;
}): string {
  if (!region.cityName) {
    return formatStateLabelByCode(region.stateCode);
  }
  const alreadyHasStateCode = region.cityName.trim().endsWith(`, ${region.stateCode}`);
  return alreadyHasStateCode ? region.cityName : `${region.cityName}, ${region.stateCode}`;
}
```

**为什么选这个方案、不是改数据库记录本身**：改数据（把 DC 这条城市记录的 `name` 从 `"Washington, DC"` 改成单纯的 `"Washington"`，跟其它城市保持同一种存法）也能解决这一个具体展示位置的问题，但影响面更难界定——需要先确认这条记录的 `name` 有没有在别的地方被直接展示（不经过 `formatSelectedRegionLabel` 这次要改的拼接逻辑），比如活动地点文字、帖子地区标签这些直接用 `location.name`/`resolveLocationName` 展示原始名字的地方；如果有，光改数据会导致那些地方从"Washington, DC"变成"Washington"，反而丢了"DC"这两个字、变得不完整。防御性地在拼接函数这一层判断，不涉及现有数据、影响面明确只限于这一个函数的输出，以后万一某条城市数据又不小心把州代码带进了名字里（人工录入的失误），也能被同一道判断挡住，不会再犯一次同样的错。

**Codex 落地前请顺手确认一下**（这一步我没有逐个文件排查完，交给你在实现时顺手核实）：`formatSelectedRegionLabel` 目前的两个已知调用点是首页顶部胶囊（`home-page.tsx`）和找搭子列表页顶部胶囊（14 号卡挪出来共用的），全局搜一下这个函数还有没有其它调用点，改完之后这些调用点的展示效果都要跟着一起验证一遍（尤其是选中 DC 时）。

## 验收标准

- 首页/找搭子列表页顶部胶囊按钮，选中 DC（Washington, DC）时第二行显示 `"Washington, DC"`，不再是 `"Washington, DC, DC"`。
- 选中其它有具体城市的州（比如 VA 的 Woodbridge）时，展示格式跟修改前完全一样（`"Woodbridge, VA"`），没有被这次改动误伤。
- 没有选中任何地区、或者选中的是没有具体城市数据的州时，展示格式不变（退回 `formatStateLabelByCode` 那一支，这次没有动这部分逻辑）。
- 不改动任何数据库数据（`locations` 表里的记录原样不动），不需要新迁移。
- `npm run typecheck && npm run test && npm run build` 全部通过；`us-states.ts`/`us-states.test.ts`（如果有）针对 `formatSelectedRegionLabel` 补一个 DC 场景的单测用例，覆盖这次修的这个 bug，避免以后回归。
