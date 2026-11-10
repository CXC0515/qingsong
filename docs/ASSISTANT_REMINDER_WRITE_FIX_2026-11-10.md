# AI 助手提醒创建缺少 operationId 修复

- 版本：v1.0
- 日期：2026-11-10
- 状态：实现完成，发布验证中

## 问题与原因

教师通过 AI 助手明确请求创建提醒时，生产日志出现服务端参数校验失败。助手工具没有要求模型传 `operationId`，但服务端 `create` schema 将它设为必填，导致请求未到达数据库保存逻辑。

## 修改方案与范围

用户确认 `operationId` 是系统用于识别同一写入及其重试的内部编号，模型不应生成。服务端在受信任的助手写入桥接处生成该编号；工具 schema 移除模型参数。重复执行仍由现有 user/message/fingerprint 数据库去重约束识别，不改变确认边界、时间解析和其他写入能力。

修改范围仅 `server/services/assistant/officialAssistant.ts`、`agent/official-teaching.mjs`、`server/services/assistant/officialAssistant.test.ts` 和本记录。

## 验证

TypeScript检查通过；日程 repository、写入授权及真实 DSH 工具链测试共16项通过。合成模型测试刻意省略 `operationId`，验证时间待定和明确时间写入、拒绝语句不写入及去重。

生产部署前仍须在 Linux Node 24.22.1 重跑类型、构建和定向测试；发布后核验服务健康与匿名鉴权。该测试使用合成模型和隔离数据，不等同于教师真实账号的再次试用。

## 发布记录

待部署完成后补充 PR、发布 SHA、恢复点与线上检查结果。
