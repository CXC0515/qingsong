# Harness 管理工作台接入

版本：v6；日期：2026-11-21；状态：断流恢复修复已获批准，实施及部署中。

用户已批准本次断流修复及部署。执行代码 review、静态检查、构建与上线健康核对；用户负责网页、手机与真实模型验收，不运行测试和浏览器。

## 本次范围
画布配置、Skill 文件目录、只读 Tools、Memory 规则、真实 Trace、Verify。工具无开关，无人工接管。沿用 DSH 与现有业务权限。

## v5 初始化失败与 Trace 修复

用户反馈新会话立即失败、后台只有模拟示例。只读核对生产原始会话，两次 turn/end 均为 cannot get property "skills" without inject，Trace 库事件数为 0。服务仍运行 v4 应用提交。Skill Provider 通过没有声明 skills 依赖的 agent.ctx 获取服务，且失败发生在首条 Trace 写入之前；初始化异常立即清理状态，结束监听也无法补录。结束状态还错误读取了 event.data.error，原生 DSH 实际使用 event.data.reason.kind。

用户批准修复 Skill 接入、初始化失败记录和运行列表，不推送或部署。基于最新 origin/main ef5efb3 创建 codex/harness-trace-recovery 与独立 worktree，保留母文件夹已有改动。

- Skill Provider 使用 DSH createScope，从已声明 skills 依赖的教学插件继承服务访问，仍按 agent 隔离；注册随 agent 销毁释放，每轮替换前等待旧注册退出。
- 进入 pre-step 初始化时即创建 run 并写入开始事件；配置载入前使用 revision 0，详情标为配置尚未载入。配置、Skill 或引用准备失败均写入初始化失败和错误结束，再清理状态。
- 按原生 reason.kind 识别错误、正常完成和中断，避免失败显示为成功。
- 运行列表每 4 秒刷新，回到可见页面时更新；保留仍有效的当前选择，不打断历史回放。模拟示例仍需手动进入，增加返回真实记录入口，无真实记录时明确展示空状态。

边界：没有扩大跨工作区访问权限，没有补造历史 Trace，没有修改业务数据或模型配置。pre-step 之前的运行时启动、系统指令组装失败及网络导致的事件写入失败仍不承诺完整记录；既有模型子进程 stderr 丢弃机制不在本次范围。真实对话失败的用户提示改造另行讨论。

验证：代码 review、两个修改模块的 node --check、TypeScript（npm run lint）、生产构建（npm run build）和 git diff --check 均通过。构建保留既有大 chunk 提示。未运行测试、浏览器或真实模型，未推送、PR、合并或部署。

## 决策
每轮固定配置及 Skill 版本；历史事件关联版本，不重放业务写入。Verify 在模型 stream 中间层拦截最终文本，调用无工具的模型做检查和最多两次文本修订；工具调用步骤照常执行，最终文本通过后交付。检查失败返回明确说明，不能伪装通过。修订不重复执行工具。

## 范围与风险
扩展现有版本配置、管理员路由、DSH 插件、Memory 服务及新增事件存储；复用已确认原型的布局和玻璃。事件可能含业务正文，只有当前工作区管理员可读；不记录凭据和私有推理。Skill 内容按受控虚拟目录管理，不执行上传脚本。模型调用与日志有大小上限，超限须明确说明。

## 修改历史
v1：用户明确授权实施，基于 origin/main e1dd82f，在独立 worktree 和 codex/harness-admin-integration 分支开发。母文件夹未提交改动保留。

## v2 代码交付概要

状态：本地代码已接入，等待用户实际验收。未合并、未部署。

- 后台 /admin/harness 展示原生 Runtime 的组件关系；旧 /admin/prompts 入口转入同一工作台。
- 主 Agent 追加指令、Context Builder 教学规则、回答格式、Memory 提取/召回/筛选、Verify 标准可以编辑。先在检查器点击笔，编辑完成后统一保存新版本；DSH 内部系统指令、权限和预算由代码控制。
- Skill 库从现有发布配置转换，支持多级目录、新建、重命名、移动、归档和恢复，保存到同一版本配置。文件只作为材料读取，不执行脚本。中文教学参考文件改用目录内渐进读取。
- 每轮固定配置与 Skill 目录，Memory 召回/筛选采用同轮版本。后台异步记忆提取任务按实际执行时的配置运行。
- Tools 在基础设置中直接展示与运行注册共用的工具定义，无需运行记录；运行回放中优先显示本轮模型可见定义与调用。没有开关或参数编辑。
- Trace 存储在系统目录的独立 SQLite 中，以工作区隔离，只允许管理员访问；保留最近 100 次运行。记录输入、上下文、Skill 披露、工具参数/回执、耗时、校验与输出，不记录模型私有推理和传输凭据。超限记录带截断标记，写入失败在运行端报告。回放遇 error/unverified 暂停，不会重新调用工具。
- Verify 在最终文本交付前实际调用同一模型核验，最多两次无工具的文本修订；教案 propose 保存前也需通过检查，不通过则候选未保存。校验异常返回未完成说明。工具步骤中的进度文本不属于最终结果核验；业务工具既有授权与参数校验保持有效。

## 验收边界

只执行代码审查、静态类型及语法检查。不运行单元测试、不启动网站、不做浏览器或真实模型验收。界面、手机操作和模型行为由用户验收。

Verify 增加模型调用成本与等待时间，原有轮次时限仍有效。修订后最终文本移除原候选的 provider replay envelope，避免旧回答重放信息与新正文不一致；多轮供应商兼容性需实际模型验收。校验不代替事实源，也不回滚已执行的业务工具。Trace 保留实际业务正文。

修改历史：v2 接入真实配置、原生 DSH Skill Provider、运行事件存储及交付前 Verify。

代码检查结果：TypeScript 静态检查、5 个 Agent 模块语法检查、Git diff --check 通过。无网站、单元测试和真实模型验收。

## v3 基础设置恢复

针对用户验收反馈，恢复已批准 Demo 的配置工作流：默认进入基础设置，运行选择与时间线只在运行回放显示；组件列表与画布均可进入检查器，先点击笔编辑，统一保存新版本。主 Agent、上下文规则、回答格式、Memory 和 Verify 编辑独立于 Trace。

Memory 按写入规则、调取规则、存储与隔离组织；实际代码约束只读披露。Tools 恢复列表与详情双窗格，窄屏按列表与详情切换，定义与 Agent 注册共用同一模块，执行权限、参数校验和业务逻辑保持不变。DSH 原生 skill 的定义依据当前安装包披露。

本次未新增运行预算或权限配置项。没有浏览器、真机或模型验收，用户在本地验收环境确认交互和保存后效果。

本次代码检查：TypeScript 静态检查、共享工具定义与四个 Agent 文件语法检查、Git diff --check 通过。未运行测试或浏览器。验收服务继续使用本地 3100/3101，未操作生产服务。

## 模拟回放验收入口

用户要求提供可见的模拟事件。新增前端内存示例“课表查询与日程校验”，17 个事件，覆盖记忆、上下文、Skill、工具、Guardrail、Verify 失败暂停及文本修订。基础设置工具栏可直接进入模拟示例，也可从运行列表选择；示例固定标识，详情带模拟数据标签，不调用模型或业务工具，不写入真实 Trace。配置草稿保持独立。

检查范围：TypeScript 与 Git 差异检查，未运行测试或浏览器验收。

## v4 正式发布记录（2026-11-21）

用户确认当前 UI 版本并授权推送、PR、合并和部署。应用 PR #174 已合并为 858d18f5eb9f798a8b619fbce788b026f2c6bd8f；母文件夹 main 快进同步后使用 git archive 打包，未包含母文件夹已有交接批注和未跟踪文件。归档 SHA256 为 088e916154dd390b3766f1bf1dc0fb34e8b449378b8f4560611b32155f01c7da。

服务器 current 已切换至 /opt/teacher-dashboard/releases/858d18f5eb9f798a8b619fbce788b026f2c6bd8f。原线上 613d30ca00b813f43e70c3a0f917a7a9d0f5d136 与其他既有发布均保留，没有清理生产数据、备份或旧目录。供应商、模型和生产凭据未改。

- 固定 Node 24.22.1 独立安装根目录和 Agent 锁文件依赖，Linux TypeScript、生产构建、6 个模块语法检查以及 SQLite/运行时模块加载检查通过。构建保留既有大 chunk 提示。遵照用户要求未运行测试或浏览器。
- 切换前确认无进行中的业务任务和原生会话；停写后创建在线恢复点 /var/lib/teacher-dashboard/backups/manual/product-2026-11-21-pre-harness-858d18f，753 个文件、12 个 SQLite，快照哈希及数据库完整性回读通过。
- 切换前后原有 12 库、192 张表计数一致，完整性与外键检查通过。Trace 新库按首次使用创建，不把尚未产生真实 Trace 当成接入失败。
- 应用、记忆服务、自动备份 timer 均 active，应用 SubState=running、NRestarts=0。公网 live/ready 与 /admin/harness 返回 200，匿名配置与运行记录接口返回 401。
- 公网入口 JS/CSS 与 release 哈希一致；懒加载 HarnessCanvas-CE0NCFPN.js 全文下载哈希一致。仅作资源与协议核对，不等于登录态界面或真实模型体验验收。
- 受限发布证据：/var/log/teacher-dashboard-harness-2026-11-21。安装/构建日志为 /tmp/qs-harness-root-install.log、/tmp/qs-harness-agent-install.log、/tmp/qs-harness-linux-build.log。

正式入口：https://td.unreached.top/admin/harness 。模拟示例为前端内存数据，不调用业务工具、不写入真实 Trace。Verify 的真实模型开销、修订质量与多轮供应商兼容性仍由用户在正式账号中验收。


### v5 发布记录（2026-11-21）

用户明确授权部署后，PR #176 合并为 6b7c08dfee6a3bfc9644d281b25b16b01052161c。母文件夹 main 快进后使用 git archive 打包，SHA256 为 47661c900e7ba08324b16610dd30db05f748853b040e0ba72f713e61596085d4，未包含母文件夹已有未提交改动。

- 服务器固定 Node 24.22.1，独立安装根和 agent 锁文件依赖；TypeScript、生产构建、模块语法、SQLite 及实际模块导入检查通过。未运行测试、浏览器或真实模型。
- 切换前无活动任务或原生会话；停写并暂停记忆服务和自动备份 timer 后创建手工恢复点 /var/lib/teacher-dashboard/backups/manual/product-2026-11-21-pre-trace-6b7c08d，762 文件、13 SQLite，校验通过。切换前后 193 张表计数一致，完整性和外键检查通过。
- current 为 /opt/teacher-dashboard/releases/6b7c08dfee6a3bfc9644d281b25b16b01052161c，应用 running、NRestarts=0；记忆服务和备份 timer 恢复 active。原 858d18f 与既有数据、备份和发布目录保留。
- 公网 live/ready、后台路由 200，匿名 Harness 配置和运行接口 401；入口 JS/CSS 与 HarnessCanvas-GMI_v7Xs.js 全文哈希匹配 release。此为服务和资源核对，不代表真实对话与 Skill 调用已验收。
- 受限发布证据 /var/log/teacher-dashboard-trace-recovery-2026-11-21，服务器安装及构建日志 /tmp/qs-trace-recovery-*.log。未改变供应商、模型、凭据、跨工作区权限或历史对话。

用户验收：刷新正式站，新建会话发一条消息，再到 Harness 的运行回放查看真实记录。若之前正在模拟回放，点击返回真实记录。此前缺失的历史 Trace 未补造。


## v6 模型断流恢复

### 问题、事实与目标
真实运行已有 32 条 Trace，Skill、discover 和 search 均成功；随后供应商流以 PI_AI_ERROR / Upstream HTTP/2 stream failed 结束。主 Agent 尚未生成完整结果，不能归为 Verify 内容校验失败。断点位于供应商、转发还是网络尚不能区分。观测中间层抛出通用 Error，又遮蔽了 DSH 原生失败恢复入口。

### 已批准范围与最短路径
用户批准修复并部署。仅调整 agent/harness-observer.mjs 的失败结束透传和窄范围错误分类、agent/official-teaching.mjs 的原生恢复事件记录、agent/runtime.mjs 的自有 provider 有界重试策略，以及本文。保留 Verify；关闭 Verify 或重跑整个业务轮次不能解决原始传输故障且可能重复写入，因此不采用。

- 仅将 PI_AI_ERROR 且原始消息完全匹配该 HTTP/2 中断的失败归为 TRANSPORT，保留原始消息与 originalCode；不修改依赖或放宽其他未知错误。
- 最终回答失败时只把 finish 和 usage 交回 DSH，原候选正文不交付；工具流仍走原生路径。取消和截断保持原生结束语义。
- 自有 qingsong provider 统一普通模式最多重试一次，既有持久化 profile 的读取同样生效；不改密钥、模型和地址，不重播已经完成的业务工具。
- 主 Agent 记录生成失败及原生等待重试、重试开始事件；恢复后的请求和最终结束照常记录，Verify 只接收正常完成的候选。

### 风险与验证
重试增加一次请求的等待和模型成本，供应商持续失败仍会结束为失败；本修复不声称消除外部断流。只做代码 review、语法/类型/构建检查、部署健康和资源版本核对，不运行测试、浏览器或真实模型。上线保留原发布目录和可恢复快照，不修改业务结构与权限。

修改历史：v6 记录已批准断流恢复方案与实施边界。

本地检查：三个修改模块 node --check、TypeScript、生产构建及 git diff --check 均通过。保留既有大 chunk 提示。没有运行测试、浏览器或真实模型。代码 review 已核对 DSH agent/request-error、原生重试预算按 step 重置和工具执行位于成功 finish 之后的顺序。
