# Saminest 文档索引

这个目录下是 Saminest（`saminest-v2`）的产品、架构、数据库和 AI 协作规范文档。开始任何开发任务前，先看 `04_Development/AI-Development.md`。

## 目录结构

- [01_Product/PRD.md](01_Product/PRD.md) — 产品需求文档
- [01_Product/FindBuddy-Design.md](01_Product/FindBuddy-Design.md) — "找搭子"（活动）功能设计文档
- [02_SystemDesign/Architecture.md](02_SystemDesign/Architecture.md) — 系统架构（v2.0，含 ADR-002 重写决策）
- [03_Database/Tables.md](03_Database/Tables.md) — 数据库表结构设计
- [04_Development/AI-Development.md](04_Development/AI-Development.md) — AI 开发规范，必须严格遵守
- [saminest_codex_reference_pack/](saminest_codex_reference_pack/) — 界面设计参考素材（设计 Token、各页面视觉规范）

## 项目现状

Saminest 是从 v1.0（Vanilla TS + Hash Router）全量重写到 v2.0 的项目，技术栈为 Vite + React + TypeScript + React Router（History 模式）+ TanStack Query + Zustand + Supabase + Vercel。当前是全新实现，没有 legacy 代码需要迁移。

代码仓库根目录另有一份面向开发者的 `README.md`（脚本命令、快速上手），这份文档专注于文档本身的索引，不重复那部分内容。
