# Saminest AI 开发规范

- 文档版本：2.0
- 产品阶段：MVP / V1
- 更新时间：2026-07
- 适用项目：Saminest（`saminest-v2`，对应 Architecture.md v2.0 / ADR-002）
- 适用工具：ChatGPT、Codex、Claude、Gemini、GitHub Copilot 及其他 AI 编程工具
- 文档状态：生效

> **本次更新说明（v2.0）**：根据 `docs/02_SystemDesign/Architecture.md` 中已 Accepted 的 ADR-002，
> 项目技术栈变更为 Vite + React + TypeScript + React Router（History 模式）+ TanStack Query +
> Zustand + Supabase + Vercel + GitHub Actions CI，且为**整体重写**，不再存在"新旧代码并存的
> 迁移阶段"。本次同步移除并替换了所有基于"vanilla TS 渐进式迁移 / legacy-app.js"假设的条款
> （原 2.3、3.4、5.4、6.1、11、12、16.3、25、27、28、31、32、33 节相关内容），其余通用工程规范
> 保持不变。

---

## 1. 文档目的

本文档用于规定 AI 在 Saminest 项目中进行代码分析、功能开发、Bug 修复、重构、测试、数据库修改和文档维护时必须遵守的规则。

目标是：

1. 降低 AI 修改无关代码的风险。
2. 避免一次性大规模重写（数据库、部署、权限模型等结构性决策之外）。
3. 防止重复创建运行入口、Supabase Client、QueryClient、Zustand Store 和全局监听器。
4. 保持代码、数据库和文档一致。
5. 保证每次修改可验证、可审查、可回滚。
6. 避免 AI 在没有证据的情况下声称任务完成。
7. 让独立开发者能够安全地长期使用 AI 维护项目。

---

## 2. 核心原则

所有 AI 开发任务必须遵守以下原则：

### 2.1 最小修改原则

只修改完成当前任务所必需的文件和代码。

禁止：

- 顺便重构无关模块
- 顺便修改页面样式
- 顺便更换技术栈
- 顺便修改数据库字段
- 顺便清理所有旧代码
- 顺便升级大量依赖

除非用户明确要求，否则不得扩大任务范围。

---

### 2.2 先理解，后修改

修改代码前必须先确认：

- 当前运行入口
- 相关文件
- 相关数据流
- 相关测试
- 相关数据库表
- 相关 RLS
- 相关已有实现（组件 / Hook / Store / Service）
- 是否存在重复功能

禁止只根据文件名或局部片段直接大改。

---

### 2.3 渐进式开发

Saminest（`saminest-v2`）根据 ADR-002 是基于 React + TypeScript 的整体重写项目，**不存在新旧代码
并存的迁移阶段**，因此不适用"提取旧实现 → 接入新模块 → 删除旧实现"的绞杀式迁移流程。

功能开发仍必须采用小步、可验证的渐进方式：

```text
明确单个功能/任务范围
→ 确认受影响的组件、Hook、Store、Service
→ 建立测试或验证基线
→ 实施最小实现
→ 验证行为符合预期
→ 运行完整验证
```

禁止：

```text
一次性大范围重写多个功能
→ 最后再尝试修复
```

> 注：结构性技术栈决策（框架、路由方案、状态管理方案等）由 ADR 记录并已在 Architecture.md 中
> 确定，AI 不得在日常任务中重新引入或恢复已废弃的技术方案（如 Hash Router、Vanilla TS 架构）。

---

### 2.4 真实验证原则

AI 不能仅凭代码看起来正确就声称完成。

必须根据实际执行结果报告：

- 哪些命令运行了
- 哪些命令通过了
- 哪些命令失败了
- 哪些步骤没有执行
- 哪些功能只进行了静态检查
- 哪些功能进行了手动验证

禁止使用以下无证据表达：

```text
应该可以
理论上没问题
已经完全修复
所有测试都通过
已经部署成功
```

除非有实际结果支持。

---

### 2.5 保持现有行为

重构任务默认不改变用户可见行为。

如果需要改变行为，必须满足至少一个条件：

- PRD 已明确新要求
- 用户明确要求改变
- 原行为是已确认 Bug
- 修改原因已经记录

不得把个人偏好当作产品需求。

---

## 3. 开始任务前必须执行的步骤

AI 在修改前应完成以下检查。

### 3.1 阅读任务相关文档

至少阅读：

```text
docs/01_Product/PRD.md
docs/02_SystemDesign/Architecture.md
docs/03_Database/Tables.md
docs/04_Development/AI-Development.md
```

根据任务额外阅读：

- 相关源代码
- 相关测试
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- Supabase migration
- RLS Policy
- Git 状态

---

### 3.2 检查 Git 状态

修改前运行：

```bash
git status --short
```

必须确认：

- 当前是否存在未提交修改
- 是否存在用户正在进行的工作
- 是否存在异常未跟踪文件
- 是否在正确分支

如果存在与任务无关的未提交修改：

- 不得删除
- 不得覆盖
- 不得自动恢复
- 不得加入当前提交
- 报告时必须说明

---

### 3.3 明确任务边界

开始前应把任务转化为清晰范围。

示例：

```text
目标：
修复收藏按钮重复写入问题。

允许修改：
- src/features/favorites/
- src/services/favorite-service.ts
- 对应测试

禁止修改：
- 登录流程
- 发布流程
- 数据库表结构
- 页面整体样式
```

任务边界越清晰，修改越安全。

---

### 3.4 识别运行路径

必须确认相关功能当前由哪份代码运行。

特别检查：

- `index.html` 加载的入口脚本
- `src/main.tsx` 中挂载的 Provider（Router、QueryClientProvider 等）
- 相关功能挂在哪个路由 / 页面组件下
- 是否存在重复的组件实现（同一功能被写了两份）
- 是否有重复事件监听
- 是否有重复 Supabase Client
- 是否存在重复的 QueryClient 或 Zustand Store 实例

不得仅修改没有被实际渲染/加载的文件，然后声称功能已经修复。

---

## 4. 修改范围规则

### 4.1 单任务单目标

一次任务优先只解决一个明确问题。

推荐：

```text
修复注册验证码提示
```

不推荐：

```text
修复注册、重构登录、改首页、加消息通知、升级依赖
```

大任务必须拆成多个阶段。

---

### 4.2 文件数量控制

没有绝对文件数量限制，但应遵循：

- Bug 修复：尽量少文件
- 小功能：只修改该 Feature 及必要公共层
- 重构：按模块分批
- 数据库修改：迁移、类型、文档和相关代码一起修改

如果一次修改大量文件，必须说明原因和风险。

---

### 4.3 不得覆盖用户工作

发现未提交文件时：

- 不使用 `git reset --hard`
- 不使用 `git checkout -- .`
- 不使用 `git clean -fd`
- 不直接覆盖用户修改
- 不删除不明文件

任何可能丢失用户工作的命令都必须经过用户明确确认。

---

## 5. 架构约束

AI 必须遵守 `Architecture.md`（v2.0 / ADR-002）中定义的架构方向。

### 5.1 单一 Supabase Client

全项目运行时只能存在一个 Supabase Client 初始化入口。

禁止：

```ts
createClient(url, key)
```

散落在页面、组件、Hook、Service 或 Repository 中。

所有模块应通过统一入口取得 Client。

---

### 5.2 单一认证监听器

`onAuthStateChange` 只能由统一认证模块（如 `AuthProvider` / 认证 Hook）注册一次。

禁止：

- 每个页面组件注册一次
- 每次路由切换注册一次
- 不同 Store 或 Hook 中分别注册
- 组件卸载后未清理导致重复累积

修改认证相关代码后，必须检查 listener 数量。

---

### 5.3 单一应用入口

`src/main.tsx` 只负责应用启动（挂载 React Root、必要的全局 Provider）。

禁止把以下内容继续堆入 `main.tsx`：

- 页面级 UI
- 收藏业务逻辑
- 发布业务逻辑
- 消息业务逻辑
- 大量事件监听
- Supabase 查询

路由结构应在专门的 Router 配置文件中定义，不应堆在 `main.tsx` 或 `App.tsx` 内联展开。

---

### 5.4 状态管理与数据请求边界

项目使用 TanStack Query 管理服务端状态、Zustand 管理客户端 UI 状态，二者职责不得混用。

禁止：

- 用 Zustand 缓存本应由 TanStack Query 管理的服务端数据（导致数据源不一致）
- 在多个文件中重复创建 `QueryClient` 实例（全局只能有一个 `QueryClient`）
- 为同一业务领域创建多个功能重叠的 Zustand Store
- 绕过 TanStack Query 直接在组件内发起 Supabase 请求并自行维护 loading/error 状态

新增数据请求应优先封装为独立的 Query/Mutation Hook（如 `useFavorites`、`usePosts`），而不是在
组件内直接调用 Repository/Service。

---

### 5.5 数据访问边界

页面和 UI 组件不得直接包含大量 Supabase 查询。

推荐依赖方向：

```text
Component
→ Query/Mutation Hook（TanStack Query）
→ Service
→ Repository
→ Supabase
```

禁止：

```text
Component
→ Supabase
```

以及：

```text
Utils
→ Database
```

---

### 5.6 禁止循环依赖

发现循环依赖时，应通过：

- 提取公共类型
- 提取公共接口
- 调整依赖方向
- 拆分职责

解决。

不得通过复制代码掩盖循环依赖。

---

## 6. TypeScript 规范

### 6.1 组件使用 .tsx，其余使用 .ts

项目基于 React，新增业务文件按以下规则选择后缀：

```text
React 组件（含 JSX）      → .tsx
Hook（如 useFavorites）    → .ts（除非 Hook 内直接返回 JSX）
类型、Service、Repository、
工具函数、Store 定义        → .ts
```

不应为非组件文件无理由使用 `.tsx`，也不应为了偷懒把 JSX 写进 `.ts` 文件（会导致编译失败）。

---

### 6.2 禁止滥用 any

禁止：

```ts
function handle(data: any) {}
```

优先：

```ts
function handle(data: Post) {}
```

不确定外部错误类型时使用：

```ts
unknown
```

再进行类型收窄。

---

### 6.3 函数输入和输出明确

公共函数应明确返回类型。

推荐：

```ts
export async function getPostById(id: string): Promise<Post | null> {
  // ...
}
```

避免：

```ts
export async function getPostById(id) {
  // ...
}
```

---

### 6.4 不伪造类型安全

禁止通过强制断言掩盖真实问题：

```ts
const post = data as Post;
```

只有在数据来源已验证时才能断言。

更推荐：

- 数据库生成类型
- 运行时验证
- 明确映射函数
- 空值检查

---

### 6.5 业务状态使用联合类型

推荐：

```ts
export type PostStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'archived'
  | 'deleted';
```

避免在多个文件中散落任意字符串。

---

## 7. DOM 和事件规范

### 7.1 避免重复监听

修改渲染逻辑时必须确认：

- 组件是否在每次渲染时重复注册监听（未使用 `useEffect` 正确管理生命周期）
- 全局事件是否重复绑定
- 路由变化后旧监听是否清理（`useEffect` 是否返回清理函数）
- Auth listener 是否重复
- 自定义事件是否重复

---

### 7.2 优先受控组件与列表 key，避免手动事件委托 Hack

React 中动态列表应通过 `map` + 稳定 `key` 渲染，事件通过标准 JSX 事件属性（`onClick` 等）绑定在
对应元素上，交由 React 的合成事件机制处理，不需要像原生 DOM 那样手动实现事件委托。

禁止：

- 为每个列表项通过 `document.addEventListener` 手动绑定/清理监听器
- 绕过 React 生命周期直接操作 DOM 节点（`ref` + 手动 `addEventListener` 之外的场景）

---

### 7.3 不使用复杂内联事件字符串

禁止在渲染的 HTML/字符串模板中拼接内联事件：

```html
<button onclick="publishPostAndUpdateStateAndNavigate()">发布</button>
```

复杂行为应由组件内的事件处理函数（或对应 Hook）管理。

---

### 7.4 用户内容必须安全输出

不得直接把未经处理的用户输入通过 `dangerouslySetInnerHTML` 或字符串拼接注入 DOM。

需要防止：

- DOM XSS
- 恶意链接
- 注入属性
- 非预期 HTML

优先直接以 JSX 文本节点渲染（React 默认转义）；确需渲染富文本时，必须使用可靠的清洗/转义方案。

---

## 8. 数据库修改规范

### 8.1 不得擅自修改数据库

除非任务明确需要数据库变化，否则 AI 不得：

- 新增表
- 删除表
- 修改字段
- 删除字段
- 修改 RLS
- 修改 Storage Policy
- 清空数据

---

### 8.2 数据库变化必须有迁移

所有结构变化必须创建：

```text
supabase/migrations/
```

中的 SQL 文件。

禁止只在 Dashboard 手动修改后不记录。

---

### 8.3 修改数据库前必须评估

至少确认：

- 是否影响现有数据
- 是否需要回填
- 是否影响旧代码
- 是否影响 RLS
- 是否需要索引
- 是否需要更新生成类型
- 是否需要更新 `Tables.md`
- 是否存在回滚或修复方案

---

### 8.4 禁止关闭 RLS 解决问题

发现权限错误时，不得通过关闭 RLS 解决。

必须查清：

- 当前用户身份
- Policy 条件
- 数据所有权
- 查询方式
- `auth.uid()`
- 管理员验证方式

---

### 8.5 不使用前端保护敏感操作

以下操作必须由数据库或受信任服务端验证：

- 审核帖子
- 封禁用户
- 修改角色
- 修改计数
- 创建系统通知
- 查看内部举报信息
- 查看管理员审核备注

---

## 9. 样式修改规范

### 9.1 不得顺便改版

功能任务默认不修改整体视觉风格。

例如修复收藏功能时，不应顺便：

- 换主题色
- 改字体
- 改全部按钮圆角
- 重排首页
- 删除动画

---

### 9.2 优先复用现有样式/组件

新增 UI 时优先复用现有的共享组件与样式：

- 按钮
- 输入框
- 卡片
- 间距
- 字体
- Toast
- Modal
- 空状态

避免为每个页面创建相似但不同的组件实现。

---

### 9.3 禁止无目的全局 CSS 修改

对以下选择器/全局样式文件的修改必须谨慎：

```css
*
body
a
button
input
img
```

全局样式变更必须检查其他页面/组件是否受影响。

---

## 10. 测试要求

### 10.1 修改前确认现有测试

必须检查：

- 当前有哪些测试
- 测试覆盖哪个模块
- 是否有失败基线
- 是否存在相关回归测试

---

### 10.2 Bug 修复必须补回归测试

能自动测试的 Bug，应增加能复现该问题的测试。

流程：

```text
测试先失败
→ 实施修复
→ 测试通过
```

无法自动测试时，必须说明原因，并给出手动验证步骤。

---

### 10.3 功能开发至少测试核心路径

例如收藏功能：

- 未登录点击收藏
- 登录后收藏成功
- 重复收藏不产生重复记录
- 取消收藏成功
- 数据库失败时显示错误
- 快速连点不重复提交

---

### 10.4 数据库权限测试

涉及数据库时必须验证：

- 用户只能修改自己的数据
- 用户不能修改他人数据
- 普通用户不能执行管理员操作
- 未登录用户不能写入受保护数据
- RLS 修改没有扩大权限

---

## 11. 必须运行的验证命令

根据当前项目脚本，重要修改完成后至少运行：

```bash
npm run typecheck
npm run test
npm run build
git diff --check
```

如果任务涉及特定测试或 lint 脚本，可额外运行对应命令（如 `npm run lint`）。

如果某命令不存在：

1. 检查 `package.json`
2. 不得伪造结果
3. 报告该命令不可用
4. 说明已执行的替代验证

---

## 12. 运行时单例检查

修改完成后应确认以下运行时实例数量没有恶化：

```text
createClient() 入口数量（Supabase）
Supabase Client 实例数量
Auth listener 数量
QueryClient 实例数量
Zustand Store 是否存在同职责重复定义
Router 实例数量
```

当前项目的目标基线是：

```text
Supabase Client：1
Auth listener：1
QueryClient：1
Router：1
同职责 Zustand Store 重复定义：0
```

如果数量发生变化，必须说明原因。

---

## 13. Git 规范

### 13.1 不自动提交，除非明确要求

默认情况下，AI 完成修改后：

- 展示修改内容
- 展示验证结果
- 展示 `git status`
- 等待用户确认

除非用户明确要求提交，否则不得自动执行：

```bash
git commit
git push
```

---

### 13.2 提交内容必须单一

一次提交只包含一个明确目标。

推荐：

```text
fix: prevent duplicate favorite writes
```

不推荐：

```text
update project
```

---

### 13.3 Commit 类型

使用：

```text
feat: 新功能
fix: Bug 修复
refactor: 不改变行为的重构
test: 测试
docs: 文档
style: 纯格式
chore: 工具和维护
build: 构建系统
ci: CI 配置
perf: 性能优化
```

示例：

```text
feat: add post reporting flow
fix: preserve publish form after upload failure
refactor: centralize Supabase client
docs: add initial database design
test: add favorite service regression coverage
```

---

### 13.4 提交前检查

提交前必须运行：

```bash
git status
git diff --check
git diff
```

必须确认：

- 没有无关文件
- 没有密钥
- 没有调试日志
- 没有临时文件
- 没有用户未要求的重构
- 文档与代码一致

---

### 13.5 不擅自推送

未经明确要求，不执行：

```bash
git push
```

如果推送失败，必须如实报告错误原因，不得称为已完成。

---

## 14. 禁止使用的高风险 Git 命令

除非用户明确授权且已经确认风险，否则禁止：

```bash
git reset --hard
git clean -fd
git push --force
git push --force-with-lease
git checkout -- .
git restore .
git rebase --onto
git filter-repo
```

也不得擅自：

- 删除分支
- 删除标签
- 改写历史
- 丢弃未提交修改
- 删除未跟踪文件

---

## 15. 文档同步规则

以下变化必须同步更新文档：

### 更新 PRD

当出现：

- 新功能
- 功能删除
- 用户流程变化
- 权限变化
- 验收标准变化

### 更新 Architecture

当出现：

- 新技术 / 技术栈变更（需新增或更新 ADR）
- 新目录层级
- 运行入口变化
- 数据流变化
- 部署方式变化

### 更新 Tables

当出现：

- 新增表
- 新增字段
- 字段类型变化
- 外键变化
- 状态变化
- RLS 原则变化
- Storage 结构变化

文档不应长期落后于代码或落后于已 Accepted 的 ADR。

---

## 16. AI 输出要求

任务完成后，AI 的报告必须包含以下内容。

### 16.1 变更摘要

说明：

- 修改了什么
- 为什么修改
- 用户可见行为是否变化

### 16.2 文件清单

列出：

```text
新增文件
修改文件
删除文件
```

### 16.3 验证结果

逐项报告：

```text
npm run typecheck：通过 / 失败 / 未运行
npm run test：通过 / 失败 / 未运行
npm run build：通过 / 失败 / 未运行
git diff --check：通过 / 失败 / 未运行
```

### 16.4 Git 状态

展示简洁的：

```bash
git status --short
```

### 16.5 剩余风险

必须说明：

- 哪些未验证
- 哪些需要手动测试
- 哪些属于后续任务
- 是否存在兼容风险

---

## 17. 不允许虚假报告

AI 不得：

1. 没运行测试却说测试通过。
2. 没部署却说线上已更新。
3. 没推送却说 GitHub 已同步。
4. 没检查页面却说所有页面正常。
5. 没读数据库却猜测表结构。
6. 没检查 RLS 却说权限安全。
7. 没看到执行结果却编造命令输出。
8. 把静态推断描述成已验证事实。

正确表达示例：

```text
代码检查通过，但尚未在真实 Supabase 环境验证。
```

```text
构建通过；移动端 Safari 尚未手动测试。
```

```text
数据库迁移文件已创建，但尚未应用到生产环境。
```

---

## 18. Bug 修复流程

标准流程：

```text
1. 确认 Bug 描述
2. 找到当前运行代码
3. 复现问题
4. 缩小根因范围
5. 添加或确认回归测试
6. 实施最小修复
7. 运行相关测试
8. 运行完整验证
9. 检查 Git diff
10. 报告结果
```

禁止只根据错误现象大范围改代码。

---

## 19. 新功能开发流程

标准流程：

```text
1. 检查 PRD
2. 明确范围和验收标准
3. 识别受影响模块
4. 评估数据库和 RLS
5. 设计最小实现
6. 编写测试
7. 编写代码
8. 验证异常状态
9. 更新文档
10. 运行全部验证
11. 检查 Git diff
12. 等待用户确认提交
```

---

## 20. 重构流程

重构必须满足：

- 行为不变
- 有验证基线
- 范围明确
- 分阶段进行
- 每阶段可回滚

推荐：

```text
提取纯函数
→ 提取类型
→ 提取数据访问 Hook / Service
→ 接入调用方
→ 删除旧实现
```

禁止：

```text
一次性重写整个应用
```

---

## 21. 数据库任务流程

数据库修改流程：

```text
1. 审计现有数据库
2. 确认 PRD
3. 设计字段与关系
4. 评估现有数据
5. 创建 migration
6. 更新 RLS
7. 更新生成类型
8. 更新 Repository
9. 更新测试
10. 更新 Tables.md
11. 在非生产环境验证
12. 再考虑生产执行
```

---

## 22. 安全相关任务

涉及以下内容时必须提高审查等级：

- 登录
- 密码重置
- Session
- 管理员权限
- RLS
- Storage Policy
- 文件上传
- 私聊
- 举报
- 封禁
- 用户联系方式
- Service Role
- Edge Functions

安全任务不得为了快速通过而削弱权限。

---

## 23. 性能优化规则

性能优化必须基于证据。

需要至少提供一种证据：

- 性能测量
- 网络请求数量
- 构建体积
- 慢查询
- 用户可复现卡顿
- Lighthouse
- 浏览器 Performance 记录

禁止因为"可能更快"进行大规模复杂化。

---

## 24. 依赖升级规则

不得一次性升级所有依赖。

升级前确认：

- 当前版本
- 目标版本
- Breaking Changes
- Node 版本要求
- Vite 兼容性
- 测试兼容性
- 构建结果

重大版本升级必须独立任务、独立提交。

---

## 25. 删除代码规则

删除代码前必须确认：

- 代码不再被加载
- 没有动态调用
- 没有路由依赖
- 没有测试依赖
- 新实现已接管（如为重构场景）
- 用户行为已验证

删除共享组件、Hook、Store 或 Service 前，必须搜索确认没有其他模块仍在引用。

---

## 26. 临时方案规则

确实需要临时方案时，必须：

- 明确标记
- 说明原因
- 说明限制
- 建立后续任务
- 不伪装成长期架构

推荐注释：

```ts
// TODO(tech-debt): Replace this temporary polling logic once the
// realtime subscription for notifications is implemented.
```

禁止使用没有说明的：

```ts
// TODO
```

---

## 27. AI 任务模板

以后可以把下面模板交给 AI：

```text
请在当前 Saminest 仓库中完成以下任务。

目标：
[只写一个明确目标]

允许修改：
[列出文件或模块]

禁止修改：
[列出不能修改的功能]

要求：
1. 修改前阅读：
   - docs/01_Product/PRD.md
   - docs/02_SystemDesign/Architecture.md
   - docs/03_Database/Tables.md
   - docs/04_Development/AI-Development.md
2. 先检查 git status。
3. 不覆盖现有未提交修改。
4. 不创建第二个 Supabase Client。
5. 不注册第二个 Auth listener。
6. 不创建第二个 QueryClient，不创建职责重复的 Zustand Store。
7. 数据库变化必须使用 migration。
8. 运行：
   - npm run typecheck
   - npm run test
   - npm run build
   - git diff --check
9. 不自动提交或推送。
10. 完成后报告：
    - 修改摘要
    - 文件清单
    - 验证结果
    - git status
    - 剩余风险
```

---

## 28. 小型 Bug 修复模板

```text
请只修复以下 Bug：

[描述 Bug]

范围：
- 只修改与该 Bug 直接相关的代码和测试。
- 不修改页面设计。
- 不修改数据库。
- 不重构无关模块。
- 不提交 Git。

请先确认该功能当前由哪份代码实际运行。

完成后运行相关测试以及：
npm run typecheck
npm run test
npm run build
git diff --check

最后报告修改文件、测试结果和未验证风险。
```

---

## 29. 重构模板

```text
请对以下模块进行渐进式重构：

[模块名称]

目标：
[例如：将组件内联的 Supabase 查询提取为 TanStack Query Hook]

要求：
1. 保持用户可见行为不变。
2. 先确认现有运行路径。
3. 先建立测试或验证基线。
4. 每次只迁移一个职责。
5. 新实现接管后才能删除旧实现。
6. 不创建重复 Client、QueryClient 或 listener。
7. 不修改无关功能。
8. 不自动提交。
9. 完成后运行全部质量检查。
```

---

## 30. 数据库任务模板

```text
请实现以下数据库变更：

[需求]

要求：
1. 先审计现有表、迁移和 RLS。
2. 不删除生产数据。
3. 创建新的 Supabase migration。
4. 明确数据回填策略。
5. 更新相关 TypeScript 类型。
6. 更新 Repository 和测试。
7. 更新 docs/03_Database/Tables.md。
8. 验证普通用户不能越权。
9. 不自动应用到生产环境。
10. 不自动提交或推送。
```

---

## 31. 明确禁止事项

任何 AI 不得在未获得明确授权时：

1. 一次性重写整个项目。
2. 删除核心状态管理层（TanStack Query / Zustand）或数据访问层。
3. 更换前端框架。
4. 更换数据库。
5. 创建独立后端。
6. 关闭 RLS。
7. 删除生产表。
8. 删除生产数据。
9. 修改管理员权限模型。
10. 升级全部依赖。
11. 重写 Git 历史。
12. 强制推送。
13. 丢弃用户未提交修改。
14. 自动部署生产环境。
15. 自动提交或推送。
16. 添加与当前任务无关的功能。
17. 声称执行了实际上没有执行的操作。

---

## 32. 完成定义

一个 AI 开发任务只有满足以下条件，才能称为完成：

- [ ] 任务目标已经实现
- [ ] 修改范围符合要求
- [ ] 没有覆盖用户未提交工作
- [ ] 实际运行路径已确认
- [ ] 没有新增重复 Supabase Client
- [ ] 没有新增重复 Auth listener
- [ ] 没有新增重复 QueryClient 或职责重叠的 Zustand Store
- [ ] 没有新增重复全局 listener
- [ ] 相关测试已补充或说明无法补充原因
- [ ] TypeScript 检查已通过
- [ ] 测试已通过
- [ ] 构建已通过
- [ ] `git diff --check` 已通过
- [ ] 数据库变化有 migration
- [ ] 文档已同步
- [ ] Git diff 已审查
- [ ] 剩余风险已明确说明
- [ ] 未自动提交或推送，除非用户明确要求

---

## 33. 当前项目特别规则

基于 Saminest（`saminest-v2`）ADR-002 确定的技术栈，必须长期保持以下运行时基线：

```text
createClient() 入口：1
Supabase Client 实例：1
Auth listener：1
QueryClient 实例：1
Router 实例：1
同职责 Zustand Store 重复定义：0
```

任何修改导致上述数量增加，都必须停止并检查。

项目为 React + TypeScript 全新重写项目，不存在 legacy 代码库或新旧并存迁移阶段；新增业务代码
一律遵循第 5、6 节的架构与 TypeScript 规范。

---

## 34. 文档维护规则

出现以下变化时必须更新本文档：

- AI 工作流程变化
- Git 工作流变化
- 验证命令变化
- 架构基线变化（含新增/变更 ADR）
- 状态管理或数据请求策略变化
- 自动化测试体系变化
- CI/CD 流程变化
- 数据库迁移流程变化
- 发布权限变化

推荐提交信息：

```text
docs: add AI development guidelines
```

后续修改可使用：

```text
docs: sync AI-Development.md with Architecture.md v2.0 (ADR-002)
```