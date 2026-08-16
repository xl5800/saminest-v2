# 一起去（Go Together / 找搭子）功能设计 v2

状态：设计确认，准备开始实现。

> **2026-08-16 更新**：找搭子的地区选择/筛选从"选具体城市"改成"选州"
> （DC/VA/MD），具体城市不再结构化存储，改由发起人自己写进活动标题。
> 原因：DMV 横跨三个州，按州筛虽然不代表真实通勤距离，但比"14 个具体
> 城市"更符合本地人日常粗略分法，也更符合"发布门槛要低"的定位。
> 复用 `locations` 表现成的 `type` 列，新增 3 条 `type = 'state'` 的行
> （原有 14 条 `type = 'city'` 的行继续给发帖用），见
> `listActiveActivityRegions()`（`src/repositories/locations-repository.ts`）。
> 下面第 2/3 节里"城市必选"/"同城市筛选"这些描述对应更新为"州"，不再
> 单独逐处改写原文。

这是对 v1 设计的一次重写，背景是 Barry 判断"找搭子"比家政、本地服务更容易提升
日活（用户会更频繁打开网站），并且希望做成一个门槛更低的"找人一起做事"板块，
而不是社交软件；长期定位是"一起去（Go Together）"，未来可以自然扩展到桌游局、
烧烤局、K歌局、电影局、演唱会、NBA观赛、线下聚会等更多玩法。v1 范围经过一轮
讨论收敛，原因见第 5 节。

## 0. 背景与原则

- 这是 Saminest 除租房/求租/二手之外的第四个业务板块，独立建表，不复用
  `posts`（理由跟 v1 一致，见 `docs/03_Database/Tables.md` 9.1 节）。
- 门槛要低：发帖流程尽量跟发帖子一样简单（标题/内容/地点/时间/人数/联系方式），
  不做审核流程（参照评论系统先例，先默认放行）。
- v1 目标：能跑起来、能上线，不引入需要付费的第三方服务（不接 Google Places
  API、不做地图、不存精确经纬度、不做真实按距离筛选）。
- 地点系统复用现有 `locations` 表（州/城市层级），不重新发明一套。
- 首页浏览体验参照小红书瀑布流卡片，配合频道筛选，提升打开频率。

## 1. 频道（channel）

固定小枚举，覆盖 Barry 列的场景，细分玩法（火锅/LOL/羽毛球这种）不建枚举，
用一个自由文本"标签"字段代替，避免以后每加一个新游戏/新吃法就要改 schema：

- `food` 🍜 吃饭搭子
- `carpool` 🚗 拼车/一起采购
- `fitness` 🏋️ 健身搭子
- `game` 🎮 游戏搭子
- `study` 📚 学习搭子
- `travel` ✈️ 旅游搭子
- `entertainment` 🎬 娱乐搭子（看电影/KTV/羽毛球/网球/hiking/滑雪）
- `other` 其他

## 2. v1 范围

做的：

- 发布/浏览/报名/退出活动
- 频道 + 自由文本标签（如"火锅"、"LOL"）
- 城市必选（复用 `locations`，线下活动必填，线上可空）
- 地标/具体地点用自由文本，直接公开展示在卡片上（例如"Planet Fitness
  Woodbridge"、"Great Falls"）——这一点跟 v1 设计不同，见第 5 节说明
- 首页/列表页瀑布流卡片浏览
- 顶部按频道筛选 + "同城市"筛选（不是真实地理距离）
- "女生优先"/"AA"/"男女不限"这类偏好信息放在标题或内容里，是发帖人自己写的
  文本，不做成基于用户资料的硬性筛选器（原因见第 5 节）

不做（明确推到 v2，等有真实需求再做）：

- Google Places 搜索具体地点、存经纬度、真实距离筛选
- 地图展示
- 按性别做用户资料层面的硬性筛选（v1 只是文本标签，不是筛选条件）
- 活动内实时聊天（先用现有私信功能顶替，不单独做）
- 管理员审核活动（先默认放行，后续需要再加）
- 报名提醒以外的通知系统（v1 只做"有人报名/退出时私信发起人"，别的场景不做）

## 3. 数据库设计

### 3.1 activities（活动）

| 字段 | 类型 | 是否为空 | 默认值 | 说明 |
|---|---|---:|---|---|
| `id` | `uuid` | 否 | 自动生成 | 主键 |
| `organizer_id` | `uuid` | 否 | 无 | 发起人，外键 `profiles.id` |
| `channel` | `text` | 否 | `'other'` | 固定枚举，见第 1 节 |
| `tag_text` | `text` | 是 | `null` | 自由文本细分标签，如"火锅"/"LOL"，1-20 字符 |
| `title` | `text` | 否 | 无 | 活动标题，1-120 字符，参照 `posts.title` |
| `description` | `text` | 否 | 无 | 活动说明（含人数/AA/性别偏好等自由文本），1-2000 字符 |
| `location_id` | `uuid` | 是 | `null` | 标准城市，外键 `locations.id`，线下必填，线上可空 |
| `landmark_text` | `text` | 是 | `null` | 具体地标/门店名，自由文本，1-100 字符，参照 `posts.location_text`，**公开展示** |
| `is_online` | `boolean` | 否 | `false` | 是否线上活动 |
| `start_at` | `timestamptz` | 否 | 无 | 活动开始时间 |
| `capacity` | `integer` | 是 | `null` | 人数上限（>0），`null` 表示不限 |
| `participant_count` | `integer` | 否 | `0` | 已报名人数，触发器维护，参照 `posts.comment_count` 先例 |
| `contact_method` | `text` | 是 | `null` | 复用 `posts.contact_method` 的枚举（message/email/phone/wechat/other） |
| `contact_value` | `text` | 是 | `null` | 联系方式内容 |
| `status` | `text` | 否 | `'open'` | `open` / `full` / `cancelled` / `ended` |
| `created_at` | `timestamptz` | 否 | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | 否 | `now()` | 更新时间，复用现有 `set_updated_at()` 触发器 |
| `deleted_at` | `timestamptz` | 是 | `null` | 软删除，参照 `posts`/`comments` 先例 |

约束：`is_online = false` 时 `location_id` 不能为空，应用层校验（跟
`price_amount`/`price_label` 互斥关系一样不做数据库层强制约束）。

### 3.2 activity_participants（报名记录）

| 字段 | 类型 | 是否为空 | 默认值 | 说明 |
|---|---|---:|---|---|
| `id` | `uuid` | 否 | 自动生成 | 主键 |
| `activity_id` | `uuid` | 否 | 无 | 外键 `activities.id` |
| `user_id` | `uuid` | 否 | 无 | 外键 `profiles.id` |
| `joined_at` | `timestamptz` | 否 | `now()` | 报名时间 |
| `cancelled_at` | `timestamptz` | 是 | `null` | 退出时间，软删除代替物理删除 |

约束：`unique(activity_id, user_id)`，退出后重新报名靠把 `cancelled_at` 置回
`null`（应用层 upsert 逻辑），不插入新行。

**不再单独建"集合点"表**：v1 设计里曾经把"集合点"拆成一张仅参与者可见的表，
这次改成地标信息（`landmark_text`）直接公开，理由见第 5 节问题 2。如果以后
真的有用户要求"报名了才能看到具体碰头点"，再加回一张类似 v1 设计的独立表，
不影响现有结构（新增表 + 新增 RLS，不用改 `activities`）。

## 4. RLS 设计（要点，不是最终 SQL）

- `activities` select：所有人可读未软删除、`status != 'cancelled'` 的活动
  （标题/描述/频道/标签/城市/地标/时间/人数汇总）——这些信息本身就是公开
  展示用的，参照产品需求（要让人能刷到活动）。
- `activities` insert：登录且未被限制的用户（`is_account_restricted()`），
  `organizer_id = auth.uid()`。
- `activities` update：发起人本人；`participant_count`/`status` 这类系统
  维护字段由触发器控制，发起人可以手动把 `status` 改成 `cancelled`（取消
  活动），但不能直接改 `participant_count`。
- `activity_participants` insert：登录且未被限制的用户给自己报名
  （`user_id = auth.uid()`），活动未取消/未结束/未满员。
- `activity_participants` select：发起人本人始终能看到该活动完整报名名单；
  其他用户只有自己也在这场活动的 `activity_participants` 里存在一条
  `cancelled_at is null` 的记录时，才能看到同一场活动的报名名单（已报名的
  人互相可见）；没报名、也不是发起人的用户，select 不到任何行，只能看
  `activities.participant_count` 这个汇总数字。这条沿用 v1 设计的结论
  （参考 Meetup 的模式），跟要不要建集合点表无关，继续保留。
- `activity_participants` update：用户只能改自己那一行的 `cancelled_at`
  （退出/重新报名）。

## 5. 这次调整跟 v1 设计的差异说明

1. **地标信息从"仅参与者可见"改成公开**。Barry 给的卡片示例（"Planet
   Fitness Woodbridge"、"Fairfax"、"周五晚上海底捞"）里具体地点都是直接
   露出在卡片上的，这是这类板块能被刷到、吸引人报名的关键信息，藏起来
   反而不符合"低门槛、像刷小红书"的产品目标。所以把 v1 里"仅参与者可见的
   集合点"砍掉，只保留一个公开的 `landmark_text`。如果以后有真实需求
   （比如担心私人住址被公开），再单独加一张受限表，方案见第 3.2 节末尾。
2. **"距离"筛选做成"同城市"而不是真实地理距离**。真实距离筛选需要接
   Google Places/存经纬度，属于 v1 明确不引入的付费/复杂依赖。城市筛选
   复用现有 `locations` 表就能满足"筛出我这个城市的活动"这个核心需求，
   成本低很多。
3. **"只看女生/只看男生"不做成基于用户资料的筛选器**。做成硬筛选需要在
   `profiles` 上收集性别这种敏感信息，涉及隐私政策更新和是否要强制用户
   填写的产品决策，v1 先不做。"女生优先"这类偏好就是发帖人自己写在标题
   或描述里的文本，用户自己扫一眼就知道，不需要专门的筛选器和数据字段。
4. **频道从 v1 单一枚举（吃饭/运动/学习/看房搭子/其他）扩到 8 个
   （吃饭/拼车/健身/游戏/学习/旅游/娱乐/其他），细分玩法用自由文本标签**。
   这样以后新增具体玩法（新游戏、新吃法）不用改数据库结构。
5. 报名列表可见性、过期/取消活动处理、通知走私信这三条 v1 已经拍板的结论
   （原设计第 5 节问题 1/2/4）继续沿用，不再重复讨论。

参考来源（沿用 v1 设计时的调研）：[Managing my events' attendees –
Meetup](https://help.meetup.com/hc/en-us/articles/9389668230541-Managing-my-events-attendees)、
[Creating an event – Meetup](https://help.meetup.com/hc/en-us/articles/39790436736525-Creating-an-event)。

## 6. 跟现有系统的关系

- 复用：`locations` 表（城市选择）、`profiles` 表（发起人/参与者身份）、
  软删除模式、denormalized 计数 + 触发器模式（参照
  `sync_post_comment_count`）、通用的 `set_updated_at()` 触发器、
  `is_account_restricted()`、`posts.contact_method` 的枚举设计、举报功能
  （`reports.target_type` 未来可以再加 `'activity'`）。
- 不复用：`posts` 表（架构文档已经明确说了这类完全不同的业务应该独立
  建表）。

## 7. 前端范围（分两批交付）

第一批（核心可用，先做）：
- 首页新增"🤝 一起去"入口
- 活动列表页（瀑布流卡片，频道筛选 + 同城市筛选）
- 活动详情页
- 发布活动表单（标题/描述/频道/标签/城市/地标/时间/人数/联系方式）
- 报名/退出按钮

第二批（收尾体验，第一批验证没问题后再做）：
- 报名名单可见性（发起人全量可见/已报名互相可见/路人只看汇总数）
- 报名/退出时给发起人发系统私信提醒（复用现有私信功能）

需要登录的操作（发布活动、报名）用 `RequireAuth` 包路由，不在页面组件内部
单独判断登录状态并跳转。

## 8. 开发时机

设计已确认，接下来先由 Claude 直接建表（走 migration），再出前端任务卡给
Codex 按第 7 节分两批实现。
