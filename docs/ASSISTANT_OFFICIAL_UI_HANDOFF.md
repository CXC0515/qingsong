# 教学助手官方 UI：规划、进展与会话交接

版本：1.1 · 2026-10-27（Asia/Shanghai）
状态：正式接入已获用户批准并完成本地实现，待用户验收；未 push/PR/合并/部署，未真实模型调用。
修改历史：1.0 原型完整交接；1.1 追加本地正式集成。下文原型部分是历史快照。

## 0. 最新状态（优先）

- 当前 worktree 不变，分支改为 codex/assistant-official-integration，从 origin/main@a53258b 创建；旧原型分支81e8366保留。
- 已复用官方Web及原生服务，通过青松登录绑定UID/工作区、隔离home、只读教学工具及总预算；旧会话仅查阅。
- 当前4480预览是正式集成的隔离样本，后端4475，不是下文旧 serve.mts；没有生产数据或真实模型费用。
- 方案、文件范围、风险、恢复命令及验收边界见 [官方接入](ASSISTANT_OFFICIAL_INTEGRATION.md)，检查证据见 [QA](qa/2026-10-27-assistant-official/README.md)。
- 历史状态中“正式集成未批准”已被本次用户授权取代；推送、PR、合并和部署仍未授权。

## 1. 当前最重要的结论

用户要的是整体教学助手，先顾全大局再优化细节。方向为：青松作为教师入口，尽量复用官方 DeepSeek Harness（简称 DSH）的框架、模型配置和成熟 UI，只补教师身份、业务工具、产品规则等必要适配。未来希望能接 QQ 等渠道，但属于后续计划。

后台基础助手已经部署；这次正在审阅的是替换其简陋聊天呈现的**官方 UI 原型**。两者不能混为一谈：生产有真实模型与只读业务工具链路，原型有真实官方 UI 但使用假模型和样本数据。代理未通过生产账号发起真实模型调用，不把 fixture 检查或健康检查当作真实教师验收。

用户已认可原型视觉方向，并批准两项调整：空会话输入框也置底，欢迎语变小变灰、副文案去标签背景。调整已完成，用户最后回复“可以的”，随后要求完整 docs 记录和交接 prompt。**尚未批准正式 UI 集成、推送、PR、合并或部署本原型。**

## 2. 阅读顺序与事实优先级

1. 根 `AGENTS.md`：修改审批、Git/worktree、协作边界。
2. `docs/PROJECT_HANDOFF.md`：生产统一入口；顶部最新事项优先。
3. 本文件：当前专项最新决策和下一步。
4. `DESIGN.md`：青松共享视觉、布局、光学参数。
5. `docs/prototypes/assistant-official/README.md`：原型运行方法与限制。
6. `docs/ASSISTANT_BASELINE.md`：已上线基础助手的身份、工具、存储、预算与原生模型管理。
7. `docs/HARNESS_BASELINE_IMPLEMENTATION.md`、`docs/NODE24_UNIFICATION.md`：基础接入与 Node 发布。
8. `docs/architecture/ARCHITECTURE.md`、`docs/architecture/adr/001-harness-integration.md`、`docs/DEEPSEEK_HARNESS_READINESS.md`：整体路线和固定官方依据。
9. 涉及其他功能再读 `docs/WORKSPACE_UI_UNIFICATION.md`、`docs/CLASSROOM_LESSON_PROJECTS.md`。

历史架构中“青松界面自己做、不直接嵌入官方 Web”及基础助手“纯文本呈现”描述的是原先取舍和已发布实现。**用户后续已明确转向优先复用官方 UI**，本文件记录最新产品方向；这不等于原型 iframe/DOM 适配已成为获批生产技术方案。正式实施前应收敛更新架构/ADR，避免双重真相。

## 3. Git、目录与保留项（本次只读核对）

- 母文件夹：`/Users/cxc/Projects/qingsong`，分支 main，本地 HEAD `a53258b827ab8d9f492f6f32fe807c6b4c972a87`（PR #82 发布记录）。本轮未 fetch，不将本地 origin/main 认定为远端最新。
- 当前工作目录：`/Users/cxc/.codex/worktrees/qingsong-harness-runtime/qingsong`。
- 当前分支：`codex/assistant-official-ui-prototype`，从当时最新 origin/main 的 `a53258b` 新建。前面已合并的 Harness/助手/模型专项使用过此 worktree，当前不要误按旧分支继续。
- 原型首次提交：`aef861b`；输入置底与弱化文案：`e415563`。均只在本地；本交接另有后续文档提交，可用 git log 查看。
- 原型文件均在 `docs/prototypes/assistant-official/`，生产 `src/`、`server/`、`agent/` 未因本 UI 原型改变。
- 当前 worktree 未跟踪 `.playwright-cli/` 是本次浏览器检查原始日志/快照，不入本次提交，暂未清理；不要误当业务文件或擅自清理未知产物。
- 母文件夹原有未跟踪内容必须保留：`docs/LESSON_PLAN_MIGRATION_PLAN.md`、`docs/TEACHER_WORKBENCH_COMPETITIVE_LEARNING_PLAN.md`、`var-local-dev-2026-09-12/`。
- 其他 worktree/分支不属于本专项，不清理。已归档的 glass-design/glass-ui 可恢复但不是运行中的预览；当前官方 UI worktree 尚未归档。

## 4. 已上线的后台基础与模型（来自已有发布证据，本次未重连服务器）

生产入口：<https://td.unreached.top/>。当前记录的应用提交 `9938b15f8a1f161673a44680887f86352a50c55c`（PR #80/#81），PR #82 只补文档，母文件夹 main 为 `a53258b`。生产 current 记录为 `/opt/teacher-dashboard/releases/9938b15f8a1f161673a44680887f86352a50c55c`。下次部署前必须实时核对，不能直接依赖此快照。

- 应用、DSH、构建与备份统一项目专属 Node **24.22.1**；系统 Node22 保留，没有直接替换系统 Node。DSH/SDK 固定 **0.2.1-rc.3**。
- 青松继续使用现有 Express、登录和工作区；DSH/Cordis 负责模型/工具执行循环、原生会话与恢复，不重写框架。
- 管理员通过青松「模型管理」进入官方 DSH 原生页面，再到账号菜单 → 设置 → 模型；复用自有 OpenAI 兼容模型及原有端点/凭据。教师只能选已配置模型。
- 用户已授权将所有原 gpt-5.6-luna 路由统一到 **gpt-6-luna**，包括教学助手与共享业务 AI 默认模型；Paddle 等独立识别后端不属于 GPT 路由。已发布并核对服务加载，供应商对模型 ID 的真实支持及质量仍待用户使用验证。
- 工作台首批聊天支持增量、停止、新会话、历史及恢复，生产原先为简单纯文本 UI；原生模型管理页面已经接通，不应为了新 UI 再写一套供应商配置。
- 首批业务工具 `qingsong_query` 为只读课表/班级、名单、指定日期课堂任务摘要和表现查询；由登录态绑定 userId/workspaceId，会话隔离，工具逐次重新授权，模型不能自报身份。来源、观测时间、结果限制与完整性标记见基础助手文档。
- 当前两三个低并发用户：全局 1 条处理 + 3 条排队；worker 每轮回收；管理页按需启动，10 分钟回收。每轮最多 3 分钟、8 个模型步骤、12 次业务查询，模型输出上限 2048 tokens；不要混淆步骤预算与原生重试的实际 HTTP 次数。
- 原生模型配置权威为产品数据根下 `system/assistant-models/profiles/web/cordis.patch.yml`，凭据由官方原生凭据服务管理。不要输出配置中的秘密或整份服务器环境变量。
- 既有发布已记录类型/构建、227 项应用测试、2 项 DSH 集成测试，以及生产权限限制下 10 项 fixture 检查。后续 GPT6 修正有针对性测试及实际壳层假模型请求检查。**这些都是历史检查证据，不是本次重新运行，更不是真实模型验收。**

运维只在需要时使用：ubuntu@43.172.77.153；SSH key `/Users/cxc/.ssh/id_ed25519_demo_silicon_valley`；服务 `teacher-dashboard.service`；current `/opt/teacher-dashboard/current`；生产数据根 `/var/lib/teacher-dashboard/product-2026-09-16-r2`。不输出密钥、服务器环境文件内容或凭据。

最近记录：7 个 SQLite 完整性通过、外键错误 0，3 个 roster schema16；助手上线没有恢复旧数据库。相关恢复点：

- `/var/lib/teacher-dashboard/backups/manual/product-2026-10-27-pre-assistant-e87ab6e`
- `/var/lib/teacher-dashboard/backups/manual/model-gpt6-luna-2026-10-27-9938b15`（配置恢复副本）
- `/var/lib/teacher-dashboard/backups/manual/product-2026-10-26-pre-glass-b10db2f`
- 更早旧版目录 `/opt/teacher-dashboard/releases/2d87132e1b838358d9393e41b7bd9cb170dcc957`，没有独立访问网址。

不得自行启动旧版连接生产数据、切线上、恢复旧库或删除恢复点。

## 5. 官方 UI 原型在哪里、如何看

**正在运行的本机预览：<http://localhost:4480/>。** 用户当前就在 Codex 内置浏览器此页，已用隔离样本账号登录。不是公网预览，不是生产数据。

源码绝对目录：`/Users/cxc/.codex/worktrees/qingsong-harness-runtime/qingsong/docs/prototypes/assistant-official/`。

| 文件 | 职责 |
| --- | --- |
| `OfficialAssistantPanel.tsx` | 复用青松 GlassSurface/GlassButton，标题、历史/新对话入口、官方 iframe |
| `vite.config.ts` | alias 替换助手组件，使用真实青松壳层；本机代理、样本自动登录 |
| `serve.mts` | 隔离业务 API、官方 DSH Web、假模型 SSE、本机代理与样本数据 |
| `tools.mjs` | 实际注册样本 qingsong_query，拒绝其他工具 |
| `native-shell.css` | 隐藏重复框架/编程控件、局部材质/触控及空会话布局适配 |
| `native-bridge.js` | 调用官方控件转发历史/新会话操作、样本文案和 DOM 容器标记 |
| `README.md` | 原型 v0.2 说明、启动方式、限制、检查记录 |
| `desktop.png`、`mobile.png` | v0.1 有消息状态截图；不代表 v0.2 空会话最新外观 |
| `empty-desktop-v02.png` | v0.2 当前已登录内置浏览器实际桌面截图 |

实际复用官方的：消息 Markdown/表格、流式 UI、步骤折叠、Lexical 输入、模型选择、消息复制/分支/赞踩、原生会话历史；不是照着截图重画聊天组件。

适配青松的：工作台外壳、助手头部、中文教学提示、隐藏编程用途入口、移动尺寸、输入框置底。官方欢迎鱼标已隐藏，未更改青松图标体系/光学参数。

**实现成熟度边界：** 原型运行完整官方 Web UI，通过 iframe 和版本绑定的 DOM/CSS 桥接探索复用。它不是已完成生产身份适配的可直接部署组件。官方客户端暴露的是 Cordis 插件、插槽和服务，不是随手 import 即可使用的独立 React Chat。正式方案应优先评估官方客户端插件/插槽接口，避免把 DOM monkey patch 原样上线；但也不要因此重新实现聊天框架。

## 6. 原型能做什么、不能做什么

- 可以实际发送、流式显示固定回答；运行真正 DSH 工具循环，查询工具返回固定两节语文课；可折叠过程、呈现 Markdown 表格/列表/引用、复制、创建新会话、打开并选择历史。
- 模型选择器显示 gpt-6-luna，但实际连本机假模型 4483；**不是对真实 GPT6 的调用证据**。
- 不论问“你好”还是课表，都可能返回同一个课表样本；这是 fixture，不是模型理解能力故障。
- 真实业务数据、真实模型、资料库 RAG、业务写入、长期记忆、学校共享和 QQ 均未在此原型接通。
- 回答结构由代理手工写的样本，用户认可其组织方式；不能把样本质量算成模型输出质量。

### 用户最新 UI 决策

1. 原官方空会话将标题与输入框居中，发消息后置底。用户认为在嵌入工作台场景位置跳动不合理，已批准并接受**空会话也置底**。
2. “今天想先处理什么？”改 18px、常规字重、灰色；“课表 · 名单 · 课堂记录”更淡，透明背景、去标签边框。不要重新强化它们。
3. 用户认可回答结构和赞踩反馈，询问收集机制。正式 UI 尽量保留官方原生能力。
4. 用户要求节省 token、快过效果；不要无必要跑全套、调用真实模型或长篇重复讲解。

### 赞踩机制：已核对源码，尚未完成本地点击落盘验收

安装包 `@deepseek-ai/dsh-client-ui-message-feedback` 提供官方赞踩 UI、分类/说明表单、成功与失败反馈；`@deepseek-ai/dsh-message-feedback` 提供 messageFeedback list/put/delete。

源码可确认：按 sessionId/messageId 关联，rating 为 positive/negative，支持 note/category/version/创建与更新时间；以 `feedback/message-put` / `feedback/message-delete` 事件写入原生会话日志，并做版本冲突与持久性检查。不是只改变图标颜色的空按钮。**本会话没有专门完成点击提交→磁盘事件→刷新回读的端到端验证。**

青松尚无统一反馈运营后台、质量统计、问题复盘或自动优化闭环；赞踩不自动训练模型，也不直接写用户 memory。建议正式集成时复用官方持久记录，再将反馈关联青松 userId/workspaceId、模型与规则版本。集中管理和数据使用范围需另提方案，不将讨论当成实施授权。

## 7. 原型运行/恢复/检查

本次交接时只读端口核对：4480/Vite PID88871；4481/API 与 4483/假模型 PID89420；4482/官方 DSH PID89428。**PID 随进程变化，只是当前快照，禁止盲目 kill。**

本地 Node 路径：`/tmp/qingsong-node-v24.22.1-darwin-arm64/bin`。所有原型端口均监听127.0.0.1。

样本临时根目录：`/var/folders/1g/x9ww0gqn1nnd0309rmg95jtc0000gn/T/qingsong-official-ui-U8adgU`；其位置记录在 `/tmp/qingsong-official-prototype-location`。临时目录可被系统清理，**源码和截图已入 Git，样本会话未作为正式数据归档。** 不要打印官方启动 token。

日志：`/tmp/qingsong-official-vite.log`、`/tmp/qingsong-official-prototype.log`。可能有原型代理连接断开日志，不能据此直接推断业务故障。旧工具会话 backend51745、Vite92645 可参考，但下一会话未必能恢复工具句柄。

服务仍存活则直接看页面，不重复启动。若已停止，在当前 worktree 根目录，用两个终端分别运行：

```sh
export PATH=/tmp/qingsong-node-v24.22.1-darwin-arm64/bin:$PATH
QS_OFFICIAL_ROOT="$(cat /tmp/qingsong-official-prototype-location)" node --import tsx docs/prototypes/assistant-official/serve.mts
```

```sh
export PATH=/tmp/qingsong-node-v24.22.1-darwin-arm64/bin:$PATH
node node_modules/vite/bin/vite.js --config docs/prototypes/assistant-official/vite.config.ts
```

临时根目录缺失则不指定 QS_OFFICIAL_ROOT，脚本自动建立新样本；第一次官方界面可能需确认预览提示、默认工作区及样本模型。不要把 QS_OFFICIAL_ROOT 指向真实数据。

本机样本登录：`official-preview@example.test`，密码 `Prototype-only-123456`，仅为源码内的合成测试账号，与生产无关。内置浏览器第一次自动登录未生效，已手工登录并确认助手可见；具体根因尚未查明。不要再声称自动登录已修复，也不要向用户索要生产密码。

### 检查证据

- 原型 v0.1：`npm run lint` 通过；实际青松壳层桌面1440×900、手机375×812检查；内外层无横向溢出、移动输入16px、发送44×44；样本流式、工具过程、表格、新会话、历史展开与选择检查通过。
- v0.2：仅6条局部 CSS 规则和文档；git diff --check通过，实际内置浏览器登录态桌面空会话检查，输入置底、文字变灰。已有消息状态规则未修改；**此轮没有重跑手机/真机/完整构建或真实模型**。
- 最新桌面原始截图还在 `/tmp/qingsong-preview-bottom-input.png`，另随本交接复制入原型目录。不要用旧 screenshot 冒充最新空状态。

## 8. 整体后续规划（不代表已实现）

五层上下文：青松公共规则 → 工作区规则 → 教师个人规则 → 教师长期记忆 → 会话/任务状态。AGENTS.md 可作为受控规则投影，业务数据库和原始资料保留权威来源；不能把用户所有数据拼入提示，也不能让模型随意写共享 AGENTS.md。

- 身份：复用青松登录，绑定 userId/workspaceId/sessionId，权限由服务端决定。未来渠道也映射到同一身份/权限/会话语义。
- 资料：权限内 RAG，默认个人范围，引用可追溯；现有关键词/全文检索不等于完整 RAG 已交付。
- 业务：课表、名单、课堂记录走结构化工具，确定性统计复用业务代码；资料证据不自动升级为指令。
- 写入：先生成具体预览，教师确认，服务端幂等提交并回读；当前只读工具不能据本次赞同扩展写权限。
- 记忆：用户可看、确认、修改、删除、失效；不要把单次对话或点赞自动当成长期事实。
- 渠道：QQ等以后考虑，尽量通过官方插件扩展；本期不接、不安装、不申请外部权限。
- 反馈：优先官方赞踩持久机制，后续再做可追溯复盘与质量统计；不承诺自动训练。

## 9. 下一会话建议最短路径与审批边界

1. 先读上述文档，只读核对当前分支、git status、远端/main、新原型目录和端口；无需为了交接立刻 SSH 或重跑全部测试。
2. 用户已接受原型方向，下一步可以提出**正式官方 UI 集成的具体方案**：明确官方插件/插槽可复用范围、青松认证与原生会话映射、历史和来源、赞踩保存/隔离、取消/错误/预算、移动键盘与代理路径。
3. 最大不确定性是官方 UI 的服务依赖如何接入已有受控 SDK worker/会话体系，不是颜色。先只读验证接口，比较“官方客户端插件集成”与“受控官方 Web 宿主”最短路径；不能把本机 proxy 的 HTML 注入、自动登录、共享 native profile 直接上线。
4. 先给目标、事实/假设、是否需代码、推荐/备选、准确文件范围、风险和验证方式，等明确同意执行。生产登录/跨用户隔离与赞踩读回是关键验证，真实模型调用仍另确认。若范围扩大再审批。
5. 获批代码从最新origin/main新建独立codex分支/worktree；当前原型仍仅本地，可选择性复用原型文件，保留用户原型与其他会话改动。不要把整个本机原型误作可直接部署变更。
6. 用户授权推送/PR/合并/部署后才执行对应步骤；正式服务仍从母文件夹稳定main打包发布。发布需按既有运维规则备份、核验与回退准备，不回滚真实数据库。

## 10. 协作偏好与其他已知问题

- 回复以🍊开头，中文、简洁；节省用户token，但关键边界不能漏。
- 所有文件写入前须有具体方案授权；本次用户明确要求将规划/进展写docs并交接，已授权本文件与统一交接入口更新，不授权代码扩张。
- 优先复用官方成熟能力、青松共享组件，不随意改图标、页面层级或玻璃参数。用户已认可输入框置底和弱灰文案，不反复重新设计。
- 用户主要负责软件真实使用验收；代理重点代码review、必要检查，明确区分构建、线上健康、真实教师与真机验收。
- Chrome 学生批量导入弹窗不能滚动而 Edge 正常是用户实测；根因未独立复现，不归因 Excel 太大或迁移，不说 PR #74 已修好。记录已在旧交接/专项中。
- 本次没有操作生产，没有真实模型调用，没有清理其他专项、worktree或真实数据；文档完成后仍保留本机预览供用户查看。
