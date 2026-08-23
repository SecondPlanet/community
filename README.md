# SecondPlanet Community Edition

**第二星球社区版**是一套面向 AI 时代的开源学习平台。它的目标不是只提供课程播放，而是让每个人都能从一个问题、关键词、主题或一本书出发，用 AI 创建自己的课程、讲义、理解测评和持续学习路径。

> 现实世界是我们生活的第一星球；SecondPlanet 是由 AI 打开的知识探索空间。

## 当前状态

社区版正在从已经运行的 SecondPlanet Enterprise 产品中进行安全、可验证的代码提取。当前仓库已经冻结许可证、版本兼容和贡献规则，但尚未发布可部署的 Community Edition。请不要把此仓库当前内容用于生产部署。

首个社区技术预览版将包含：

- 课程、章节、课时和学习进度；
- 笔记、基础证书和学习工作台；
- 邮箱登录和基础 OAuth；
- 基础后台管理和站点配置；
- AI 自建课程基础闭环；
- 用户自带模型密钥（BYOK）；
- 基础 AI Tutor、三题理解测评和内容安全；
- 单节点 Docker Compose 部署。

## Community 与 Enterprise

SecondPlanet 采用 Open Core 模式：

- [`SecondPlanet/community`](https://github.com/SecondPlanet/community) 是公开的 **Community Edition**，采用 [GNU AGPL v3](./LICENSE)；
- `SecondPlanet/enterprise` 是独立私有的 **Enterprise Edition**，增加组织、多租户、SSO/SCIM、高级权限、审计、AI 成本治理、高可用运维、企业白标和商业支持；
- `SecondPlanet/website` 是官方站点与企业版在线 Demo 的独立私有仓库，当前暂不开发；
- 社区版的基础安全、数据隔离和可恢复性不会被人为降级；
- 企业版与社区版使用同一核心版本号，并通过自动兼容测试验证。

完整边界见 [EDITIONS.md](./EDITIONS.md)，版本规则见 [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md)。

## 版本关系

同一核心版本的两个发行版保持 API、数据库扩展点和共享类型兼容：

```text
Community:  v1.8.0
Enterprise: v1.8.0-enterprise.1
```

社区版是企业版的核心基线。企业功能只能通过显式扩展接口接入，不能要求社区版依赖任何闭源包。

## 参与贡献

社区 Issue 和 Pull Request 都在本仓库处理。被接受的社区修复会进入下一版社区基线，并同步进入企业版；企业版中属于公共核心的修复也必须回流到本仓库。

在提交代码前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [SECURITY.md](./SECURITY.md)。

## 商标与商业授权

源代码许可证不授予 SecondPlanet / 第二星球的名称、Logo 或品牌资产使用权。相关规则见 [TRADEMARKS.md](./TRADEMARKS.md)。

需要企业功能、私有化交付、商业双授权或技术支持时，请通过项目维护者公布的官方联系方式联系。
