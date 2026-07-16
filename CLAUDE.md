\# Saminest 项目说明



这是 Saminest 项目——面向北美华人社区的本地生活平台(DMV 地区起步:租房/求租/二手)。



\## 必读文档(每次任务开始前)

\- docs/01\_Product/PRD.md — 产品需求

\- docs/02\_SystemDesign/Architecture.md — 系统架构(v2.0,含 ADR-002 重写决策)

\- docs/03\_Database/Tables.md — 数据库设计

\- docs/04\_Development/AI-Development.md — AI 开发规范(必须严格遵守)



\## 技术栈

Vite + React + TypeScript + React Router(History 模式) + TanStack Query + Zustand + Supabase + Vercel



\## 当前阶段

项目从 v1.0(Vanilla TS + Hash Router)全量重写到 v2.0。当前是全新实现,无 legacy 包袱。



\## 硬性规则

严格遵守 docs/04\_Development/AI-Development.md 中的所有规则,尤其是:

\- 最小修改原则,不擅自扩大任务范围

\- 不自动 git commit / push

\- 数据库改动必须走 migration

 禁止的高危 Git 命令(见文档第 14 节)
\-如果这次改动中,你发现和现有代码有相似逻辑但选择了重新实现(而不是复用),必须在报告里说明原因。
\-本项目文件命名统一使用 kebab-case(如 auth-service.ts),组件文件用 PascalCase 组件名 + kebab-case 文件名(如 register-page.tsx 导出 RegisterPage)。新建文件前检查是否符合这个约定。

