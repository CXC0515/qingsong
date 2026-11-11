# AI 助手提醒写入与时间解析修复

- 版本：v1.1
- 日期：2026-11-11
- 状态：PR #170 已合并，已部署；正式账号、真实模型与真机体验待教师验收

## 问题与原因

教师报告助手把“下午三点”保存成普通文字、标题混入时间表达，并同时显示“已创建”和“时间待定”。代码核查确认：服务端只在可信原话同时解析出日期和时间时才生成 `startAt`；模型补出的日期被忽略后，单独的时间会落到 `timeLabel`。模型返回的事项名也曾直接用于数据库。

此前 `operationId` 由服务端生成的修复仍保留。本次新增规则：

- 日期与时间均在教师原话中明确时，保存原话对应的本地日期和 24 小时时间；模型猜测日期仍不采纳。
- 只给出时间且该时间晚于提交时刻时，以 `Asia/Shanghai` 当天保存。该时间今天已过则不创建、不顺延，明确让助手询问日期。
- 无时间的明确提醒继续立即保存为时间待定；部分时间约束保留为原始标签。
- 事项名称从教师原话提取，剥离日期、时间和开头的提醒指令；工具回执是助手报告“已创建”和时间的唯一依据。
- `operationId` 仍由服务端生成，重复执行仍由现有 user/message/fingerprint 去重约束处理。

修改范围为 `server/services/assistant/scheduleAuthorization.ts`、对应单测、`server/services/assistant/officialAssistant.ts`、`server/services/assistant/officialAssistant.test.ts`、`agent/official-teaching.mjs` 和本记录。未改数据结构、其他写入能力、管理后台或 AI 备课。

## 验证与性能调查

上海时间解析/名称清理单测 4 项通过；官方助手本机 HTTP/DSH 合成测试 5 项通过，其中提醒写入验证了无时间、明确次日时间、否定表达、无日期的时间解析与标题清理。`npm run lint` 和 `npm run build` 通过；构建保留既有 500 KB chunk 提示。本机 Node 为 24.11.1，`better-sqlite3` 为此版本本机构建后测试通过；生产发布仍必须在 Node 24.22.1 重跑。

启动慢的页面侧调查使用独立浏览器 session 和隔离合成账号。Vite/API 预览中，官方 iframe 请求约 1.7 秒完成；DSH iframe 内 `session/modelCatalog` 首次请求约在导航后 0.3 秒，之后 `session/list`、默认会话创建均在毫秒级返回；重新载入后助手可用，未复现可用后仍显示载入条或数十秒停顿。另一轮预览初始化因本机缺少 Python `python-pptx` 在材料样本准备处失败，不将其作为助手启动失败证据。没有发现可据以安全改写启动生命周期的已复现瓶颈，本次不做猜测性加载优化；正式账号下的用户感受仍待复测。

发布前在 Linux Node 24.22.1 重跑类型、构建和定向测试；按已授权流程推送、PR、合并后部署。部署需先制作并校验生产恢复点，再核验服务健康、静态资源哈希和匿名鉴权。合成模型和隔离数据不等同于教师真实账号、真实模型或手机验收。

## 发布记录

- PR [#170](https://github.com/CXC0515/qingsong/pull/170) 已合并。应用生产提交 `613d30ca00b813f43e70c3a0f917a7a9d0f5d136`，从母文件夹稳定 main 的已提交版本导出；母文件夹既有批注和未跟踪专项文件保留。
- 合并时保留并联合验证另一会话已发布的 AI 备课 PR #171/#172。上一应用发布为 `7748a601dbca8d8835eb6271d6ecb6e97dff12f9`，未回退其修改。
- Linux Node 24.22.1 独立安装依赖后，类型、生产构建、31 项业务/助手集成、22 项 Agent 回归通过；失败/跳过均为 0，真实供应商调用 0。主项目现有 peer 冲突使用 `npm ci --legacy-peer-deps`；agent 使用 npm 11.6.2 正常 `npm ci`，锁文件未改。不能对 agent 使用 `--legacy-peer-deps`，否则缺少必需的 DSH 协议 peer 包。
- 发布前活动任务计数为 0。停写后制作并回读验证 `/var/lib/teacher-dashboard/backups/manual/product-2026-11-11-pre-reminder-time-613d30c`：711 文件、12 SQLite；原有恢复点保留。
- current 已切换至应用提交；12 库完整性、外键检查通过，切换前后 192 张表计数一致；服务 active/running、NRestarts=0，备份 timer 与记忆服务 active。
- 610 份已提交文件与 release SHA256 一致，78 份公网构建资源逐一哈希匹配；回环/公网 live、ready 正常，助手匿名访问 401，部署后 error 级日志无记录。
- 服务器证据：`/var/log/teacher-dashboard-reminder-time-2026-11-11`；检查日志 `/tmp/qs-613d30c-{lint,build,tests,native}.log`。这些是合成测试与发布核验，不代表真实账号、模型教学质量、物理手机或慢启动问题已验收。

## 修改历史

- v1.0（2026-11-10）：记录服务端 `operationId` 由模型参数改为服务端生成。代码已随主线既有发布；本版不重复实现。
- v1.1（2026-11-11）：按教师反馈修复时间-only 写入和事项标题，记录本机浏览器启动复测；PR #170 合并，Linux 联合验证、停写恢复点、部署与公网核验完成。
