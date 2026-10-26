# DeepSeek Harness：现状与整体方案入口

版本：2.0 · 2026-10-26
状态：已按用户授权升级整体方案文档；五层结构已认可，具体技术推荐待评审。未安装、集成、调用模型或改动生产。

## 本次概要与阅读路径

用户明确要求先顾全整体，再优化细节，并认可公共规则、工作区规则、个人规则、长期记忆、会话/任务状态五层。v2.0将原准备度说明升级为完整架构，不再用单个问答场景限定产品范围。

- [整体架构主文档](architecture/ARCHITECTURE.md)：目标、职责、五层结构、身份与运行、工具/Skills/RAG、审批、恢复、交互、治理及阶段验收；后续方案细节只在此维护。
- [架构图](architecture/harness.mmd)：教师控制、上下文、运行、业务与结果反馈。
- [ADR-001](architecture/adr/001-harness-integration.md)：推荐SDK+受控profile、共享管理器与隔离运行空间、规则投影、业务契约与可选MCP的取舍。

原v1.1正文由以上内容取代，可从Git追溯。此前MCP优先表述已明确调整，不能把旧文档和新ADR同时当作当前技术决策。

## 已核对的青松基础与缺口

核对基线：青松`origin/main@d207481d667fa381647ded0c8117d24970c37432`。只读代码核对，不代表运行/集成验收。

| 代码事实 | 证据入口 | 接入缺口 |
| --- | --- | --- |
| 登录教师及工作区隔离、请求上下文与角色校验 | `server/middleware/authenticated.ts`、`server/context/workspaceContext.ts` | 后台run需独立身份绑定、租约和逐次鉴权 |
| user_id主键、workspace_id唯一，当前一人一个个人工作区 | `server/database/authDatabase.ts`、`server/auth/invitations.ts` | 学校组织/多成员/共享规则不是现成功能 |
| 个人资料有独立读写接口 | `server/routes/account.ts` | 不能将资料字段直接当作已实现的长期记忆系统 |
| 名册、课表、日程、课堂事实、批改与资料服务已存在 | `server/routes/roster.ts`、`server/routes/schedule.ts`、课堂和批改路由 | 教学工具的统一输入/输出、权限及来源契约 |
| 关键词搜索、资料级全文检索/回退及资料详情可用 | `server/routes/resources.ts`、`server/repositories/resourceRepository.ts` | 全库召回质量、混合检索/向量和重排须样本评估 |
| 课堂有预览、版本校验、幂等追加与结果核对基础 | `docs/CLASSROOM_LESSON_PROJECTS.md`及课堂服务 | 其他写入不能假定已有同样协议 |
| 有任务专用模型调用，助手是UI预留区 | `server/services/multimodal/OpenAICompatibleProvider.ts`、`src/features/workbench/Workbench.tsx` | 助手会话、运行、流、审批、规则/记忆管理尚未接通 |

## 本轮官方研究基线

2026-10-26通过官方Git远端HEAD核对到`22ddee3792402c3e70ec5f86a63c3e3e895a2f60`。以下均使用固定提交链接，避免主分支后续变化让论据漂移；它只是研究基线，不是已安装或最终部署锁定版本。

| 官方资料 | 本轮核对要点 |
| --- | --- |
| [架构](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/architecture.md) | Cordis插件、profile与官方SDK/启动方式，复用原生执行机制 |
| [指令机制](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/context/agent-instructions/README.md) | 全局路径随进程home；支持规则加载但不自动提供青松多用户隔离 |
| [SDK应用](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/sdk-app/README.md) | stdio协议与宿主职责；教师时区和UI问答需接入层明确承接 |
| [sdk-minimal](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/sdk-minimal/README.md) | 默认能力及缺省服务需逐项检查，不能按名称推定已有全部能力 |
| [Session](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/session/README.md) | 日志/持久化与历史投影；不能代替业务回执或长期记忆治理 |
| [MCP客户端](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/mcp/mcp-client/README.md) | 支持stdio/Streamable HTTP，青松负责自己的授权与审批 |
| [根package.json](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/package.json) | 标注0.2.1-rc.3、Node>=24.9.0；生产运行时兼容性尚需实施前验证 |

## 本轮验证与未执行事项

仅核对代码事实、官方文档、内部链接、架构图/ADR一致性和Git变更范围。不运行框架安装、不生成profile配置、不启动预览或生产服务、不读取生产业务内容、不调用模型。SDK连接、工具允许列表、规则刷新、沙箱、持久化、RAG质量和跨用户隔离均未进行实际集成验收。

## 修改历史

- 2.0：整体架构成为方案主文档，本文件收敛为事实/来源/缺口入口；固定研究提交，明确推荐与已确认层级的边界。
- 1.1：形成身份、MCP、RAG与配置建议，仅文档；现由2.0取代。
- 1.0：初始官方资料与代码准备度对照，未集成。
