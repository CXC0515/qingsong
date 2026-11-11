# AI 教案上下文容量、压缩连续性与工具循环修复

- 版本：v1.2
- 日期：2026-11-11（Asia/Shanghai）
- 状态：PR #171 已合并并部署；真实账号、真实模型和真机体验待教师验收。
- 基线：`origin/main@765f03ae66c7ab4c7b1cd250e3ae8be28cc63c95`

## 原始问题与目标

生产将 `qingsong/gpt-6-luna` 登记为 32,768 token 上下文，DSH 在 70% 附近自动压缩。用户提供该模型实际上下文容量为 1.05M。长备课期间，对同一个失效资料引用仅改变分页位置会重复请求；压缩后模型重新加载已读 Skill；步数耗尽时，需要根据业务记录明确说明任务阶段与候选保存状态。目标是让运行时使用正确容量，在接近容量时才压缩，并让重复失败与压缩后的任务继续可控、可观测。

## 事实、假设与边界

- 已核实：生产模型 profile 将该模型登记为 32,768；当前压缩比例为 0.7，headroom 为 4,096，输出上限登记为 4,096。
- 用户提供：GPT-6 Luna 实际上下文为 1.05M；本专项按 1,050,000 token 使用该容量，不将其描述为独立供应商验证结果。
- 已核实：当前失败指纹包含全部分页参数；更换 offset 会绕过同参数重试保护。备课来源读取使用当前备课 ID 和来源 ID 精确查找。
- 已核实：助手进程内轮次状态跨压缩仍存在，但 Skill 正文和工具结果属于可压缩对话历史，运行时没有固定保存已加载 Skill 正文与任务动作回执。
- 已核实：轮次释放把仍在运行的备课任务标记为 `interrupted`。候选写入与 baseRevision 校验已有事务和回读保护，继续保留。
- 不改 Skill 文件、管理后台、工作台、数据库 schema、供应商/模型路由及输出 token 配置；不读取网页。生产配置只在助手运行时对精确模型路由应用容量覆盖，不直接修改生产文件。

## 实施方案

1. 在 `agent/runtime.mjs` 为 `qingsong/gpt-6-luna` 的模型元数据统一登记 1,050,000；现存 profile 读取时也应用精确路由覆盖，避免 `bootstrapModels` 的 `wx` 初始化只对新环境生效。保留 maxTokens、凭据、provider 与 endpoint。
2. 在 `agent/official-runtime.mjs` 将压缩门槛由 0.7 调至 0.9，保留现有 4,096 headroom、2,048 压缩摘要上限、0.16 最近对话保留比例和重试策略。有效容量约 1.05M 时，常规触发点约 945K；测试覆盖实际容量换算。
3. 在 `agent/official-teaching.mjs` 保存本轮已成功加载的 Skill 正文、最近备课动作核验状态及失效读取引用，并通过稳定系统上下文重新提供这些必要状态。重复 Skill 请求不再再次读取；状态只在本轮内存中保留，不持久化业务对话正文。
4. 在 `agent/tool-contract-recovery.mjs` 对 `OBJECT_NOT_FOUND`/`SOURCE_NOT_FOUND` 按对象 ref 与 section 建失败记录，排除 offset、limit、textOffset；同 ref 只换分页会得到明确拦截，仍可重新 search/discover，新引用可以继续读取。完善来源不存在的错误恢复说明。
5. 在 `src/domain/preparationToolContract.mjs` 明确动作互斥字段、必填字段和多余字段修正方式，覆盖 `progress.operationId`；继续使用服务端严格校验。
6. 在 `server/services/assistant/preparationAssistant.ts` 与 `agent/official-ui/failure.js` 回传并展示最近任务状态、阶段及该任务所关联候选的状态；无候选时明确说明未保存修改建议，候选状态按存储回读，不由模型推断。
7. 保留成功候选的原子写入、操作编号幂等、baseRevision/inputFingerprint 校验与状态回读，新增回归覆盖。

## 文件范围

- `agent/runtime.mjs`
- `agent/official-runtime.mjs` 与 `agent/official-runtime.test.mjs`
- `agent/official-teaching.mjs` 与 `agent/official-teaching.test.mjs`
- `agent/official-skills.mjs`（只为运行时提供已发布 Skill 正文读取接口；不改任何 Skill 文件）
- `agent/tool-contract-recovery.mjs` 与 `agent/tool-contract-recovery.test.mjs`
- `src/domain/preparationToolContract.mjs` 与其领域测试
- `server/services/assistant/preparationAssistant.ts` 与对应测试
- `agent/official-ui/failure.js` 与 `agent/official-ui/failure.test.mjs`
- 本专项文档

## 风险与验证

1. 1.05M 容量来自用户提供，不是本专项获得的供应商规格证明。过高登记会让更长请求进入上游，若该路由实际容量较低可能收到上游溢出；模型路由保持不变，需真实模型验收。
2. 将门槛设为 90% 保留约 10% 空间，并保留 4,096 token 固定 headroom；通过 DSH 实际容量计算测试，确认不会在约 23K 处提前整理。
3. ref 去重只针对来源/对象不存在，不拦截有效分页或换用新的 search ref；按同 ref 多 offset、重新 search、新 ref 分别验证。
4. 稳定上下文只注入已加载 Skill 和结构化任务状态，控制体积，不保存原始对话或资料正文；压缩前后回放断言 taskId、baseRevision、阶段、候选状态和 Skill 内容仍可见。
5. 上限反馈覆盖无候选、待应用、已应用、已丢弃与状态核对失败；运行时服务端数据是唯一依据。
6. 运行相关测试、类型检查与构建，保护候选事务/版本冲突现有测试。网页读取及真实账号/真实模型验收本专项不执行；合成测试不代表模型验收。

## 生产发布回执（2026-11-11）

- 用户明确授权部署后，完成 push、PR #171 与合并；应用生产提交为 `7748a601dbca8d8835eb6271d6ecb6e97dff12f9`。母文件夹 main 已快进至该提交，原有未提交内容保留；正式包由母文件夹的已提交 main 导出。
- 独立发布依赖安装后，Linux Node24.22.1 类型检查、生产构建、32 项业务/助手/授权测试与21项 Agent 回归全部通过，无失败或跳过。根依赖沿用已核实的 `--legacy-peer-deps` 处理现有 peer 冲突，锁文件未改。此次真实模型调用为0。
- 发布前活动任务检查为0。停写后创建并验证恢复点 `/var/lib/teacher-dashboard/backups/manual/product-2026-11-11-pre-lesson-compaction-7748a60`，711文件、12SQLite；上一版 `1417b6802ac7602901898c3221d8fcdded2fcd0c` 保留。
- current 已切换至该应用提交；systemd active/running、NRestarts=0，备份 timer 与记忆服务 active；回环/公网 live、ready 成功，首页200，助手匿名访问401，切换后 error 级日志无记录。
- 433份已提交源码文件与服务器逐一SHA256比对一致；76份公网静态资源与服务器构建产物哈希一致。
- 服务器验证日志位于 `/var/log/teacher-dashboard-lesson-compaction-2026-11-11`。正式账号、真实模型备课、手机操作与历史失败会话复测尚未执行；上述自动化和健康检查不代表这些验收完成。

## 修改历史记录

- v1.0 / 2026-11-11：用户批准 1.05M 有效容量、90% 自动整理门槛、工具引用防重复、压缩连续状态、任务上限结果明确反馈及动作参数说明修复；本记录先于代码实现创建。
- v1.1 / 2026-11-11：完成获批代码范围和定向验证。实际 DSH 测试确认 1.05M 路由在 945,000 token 进入压力整理；验证任务中断与同会话已保存候选能分别回读。Node 24.11.1 下定向测试、类型检查和构建通过；项目要求 Node 24.22.1，本机指定版本获取失败，故未声称在规定 Node 版本验证。未进行真实模型/教师验收。
- v1.2 / 2026-11-11：用户授权后完成PR合并、Linux指定Node验证、停写恢复点及生产部署；真实场景验收边界保留。
