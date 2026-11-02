# Community Edition 功能补齐规划（源码提取路线图）

> 依据：`EDITIONS.md`（能力边界）+ `enterprise/docs/OPEN_CORE_STRATEGY.md`（提取顺序）。
> 目标：把 Enterprise v1.10.0 中属于公共核心的功能提取到本仓库，产出**可独立部署的 Community v1.10.0**。

## 现状

- 本仓库 `governance_only`（v0.0.0），无代码；enterprise manifest `extraction_pending`。
- Enterprise 基线：pnpm monorepo（apps/api、apps/api-go、apps/web、apps/admin），Prisma 70 model / 27 migrations。
- 边界表已对齐 v1.8–v1.10（e72f2e6）。

## 提取范围（按 EDITIONS.md 定死）

### Community 保留（API 模块）

auth, users, health, prisma, courses, enrollments, progress, notes, certificates,
degrees, badges, points, orders, practices, reviews, hackathons, instructors,
cms, site, uploads, url-import, notification, learning-events, learning-home,
learning-projects, personal-learning, chat, ai, ai-course-generation, ai-jobs,
ai-model-gateway, project-tutor

### Community 剔除（Enterprise 专属）

- `enterprise`（组织/咨询）、`audit`（审计日志）、`ai-operations`（AI 运维后台）、`ai-budget`（预算/成本中心）
- `apps/api-go`（Go 迁移是企业内部实验，社区版不背双运行时）
- 企业 admin 页面（AI 运维 5 tab、审计、预算、白标、组织）
- `AuditLog`、`EnterpriseInquiry`、`EnterpriseMethod`、`Industry`、`AiConfig`（平台密钥托管）、`AiUsage`、`AiBudgetReservation`、`AiRuntimeControl` 等企业 model
- 部署脚本中的腾讯云企业镜像/registry 通道

### 边界裁剪要点

- `ai-model-gateway` 保留（Provider 抽象 + `UserAiProviderConfig` BYOK）；删平台密钥托管与多 Provider 路由部分，社区版仅 BYOK 模式。
- Prisma schema 裁剪后重建 migration 链（不带企业历史迁移），目标 ≤ 50 model。
- 社区版不得 import 任何企业包；`packages/shared-types` 中企业类型单独拆出。

## 分阶段执行

### Phase 0 — 隔离工作区 + 扫描工具（0.5 天）

1. 在独立 checkout（非 enterprise git 历史）搭建本仓库代码骨架。
2. 集成 gitleaks + PII/license 扫描脚本（`scripts/scan.sh`），作为推公开仓的门禁。

### Phase 1 — 核心学习闭环提取（3–5 天）

1. 复制 enterprise 树（不含 .git/node_modules/dist/coverage），按上面范围删除。
2. API：删 4 个企业模块 + 引用清理；schema 裁剪 + migration 重建；全量测试跑绿。
3. Web/Admin：删企业页面与路由；admin 只留基础 CMS/站点配置/黑客松后台。
4. 门禁：`pnpm test` + `pnpm build` + tsc 双 0 错；schema 无企业表引用。

### Phase 2 — v1.9/v1.10 功能验证入（与 Phase 1 同批，不单独开发）

- AI 助教流式对话 + RAG 课时上下文
- 测评重做 + 答案键出口隔离（`sanitizeGrading`）
- 课程完成闭环（相似课程、完成通知、笔记时间戳跳转）
- 黑客松站内报名与筛选（自定义报名表单、审核、组队、作品提交、评分）

这批功能在企业仓已带完整测试，随代码自然带入，只需确认不依赖被剔除模块。

### Phase 3 — 单节点部署 + 社区 CI（1 天）

1. Docker Compose 单节点编排（api + web + postgres + minio），含 `.env.example`。
2. GitHub Actions：lint/test/build + 扫描门禁 + Docker 镜像发布到 ghcr。

### Phase 4 — 发布与挂钩（0.5 天）

1. `edition-manifest.json` → `releaseVersion: 1.10.0`，`releaseStatus: technical_preview`。
2. 打不可变 tag `v1.10.0`，Release Notes 只描述公开能力。
3. Enterprise 侧：manifest 填 `communityCoreVersion: 1.10.0` + community commit SHA，`compatibilityStatus: synced`；后续企业发版先升级社区 tag。

## 里程碑验收

- [ ] 社区仓 `pnpm test` / `build` 全绿，无企业 import
- [ ] 扫描门禁零 secret/PII 命中
- [ ] Docker Compose 一键起，完成"注册 → 建课 → 学习 → 测评 → 证书"闭环
- [ ] 黑客松报名流（表单→审核→组队→提交→评分）在社区版可用
- [ ] `v1.10.0` tag 发布，enterprise manifest 挂钩完成

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| schema 裁剪牵连共享表（如 LearningEvent 引用企业枚举） | 先做依赖图分析再删；expand 模式重建 migration |
| BYOK 与平台网关耦合在 ai-model-gateway | 只删 AiConfig 消费分支，Provider 抽象不动 |
| 扫描误报阻塞发布 | 白名单机制 + 人工复核记录在 PR |
| api/web 双端类型漂移 | shared-types 单一来源，企业类型用独立 entry 拆分 |
