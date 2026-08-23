# Community / Enterprise Compatibility

## 单一核心版本

SecondPlanet 使用 `MAJOR.MINOR.PATCH` 作为社区核心版本。企业发行版在同一核心版本后增加企业构建序号：

```text
Community tag:  v1.8.0
Enterprise tag: v1.8.0-enterprise.1
```

企业版的 `coreVersion` 必须精确对应一个已发布的社区 tag。企业构建不能引用未发布、无法审计的社区快照。

## 兼容合同

每次同步必须验证：

- Community 的 API 和共享 DTO 测试全部通过；
- Enterprise 扩展可以在目标 Community tag 上编译；
- Community 数据库迁移可单独运行，不引用企业表；
- Enterprise 迁移只能扩展 Community schema，不能覆盖社区迁移；
- 无 Enterprise license 时，社区核心仍能独立启动；
- Community 构建产物中不存在企业源码、私有包、许可证密钥或商业配置。

## 同步方向

```text
Community PR ──merge──> Community main ──tag──> Enterprise core upgrade
       ▲                                      │
       └──────── public/core bugfix ──────────┘
```

企业仓发现的公共核心缺陷，应先在本仓创建脱敏 Issue/PR。包含客户数据、安全细节或未公开企业实现的修复，先走私有安全流程，再发布不泄密的社区补丁。

## 发布节奏

- Community 正式版本先发布；
- Enterprise 在对应 Community tag 通过兼容门禁后发布；
- Enterprise 可以增加构建序号，但不能伪造更高的社区核心版本；
- 安全补丁允许两个发行版协调发布时间，但社区补丁不能无期限扣留。

